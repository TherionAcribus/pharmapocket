from __future__ import annotations

import shutil
import tempfile
from io import BytesIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.db.models.query import QuerySet
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from django.utils.text import slugify
from learning.models import LessonProgress
from PIL import Image
from rest_framework.test import APITestCase
from taggit.models import Tag
from wagtail.images import get_image_model
from wagtail.models import Page, Site

from .models import (
    CardType,
    CategoryMedicament,
    CategoryPharmacologie,
    Deck,
    DeckCard,
    PathologyThumbOverride,
    MicroArticleIndexPage,
    MicroArticlePage,
    Subject,
    SubjectCard,
    UserDeckProgress,
)
from .permissions import IsStaff
from .serializers import MicroArticleCardSerializer
from .serializers.inputs import READ_STATE_MAX_SLUGS
from .views import (
    _get_or_create_default_deck,
    AdminImageUploadView,
    AdminMicroArticleSearchView,
    AdminPackBulkAddView,
    AdminPackDetailView,
    AdminPackListCreateView,
    AdminPackRemoveCardView,
    AdminPackReorderCardsView,
    AdminThumbOverrideDetailView,
    AdminThumbOverrideListCreateView,
    SubjectCardDetailView,
    SubjectCardsReorderView,
    SubjectCardsView,
    SubjectDetailView,
    SubjectListCreateView,
)


class DefaultDeckConcurrencyTests(APITestCase):
    def test_creation_collision_returns_the_concurrent_default_deck(self):
        user = get_user_model().objects.create_user(
            username="default-deck-race",
            email="default-deck-race@example.com",
            password="pharmapocket-test-pwd",
        )
        concurrent_deck = Deck.objects.create(
            user=user,
            type=Deck.DeckType.USER,
            name="Deck concurrent",
            is_default=True,
            sort_order=0,
        )

        original_first = QuerySet.first
        first_deck_read = True

        def hide_default_on_initial_read(queryset):
            nonlocal first_deck_read
            if first_deck_read and queryset.model is Deck:
                first_deck_read = False
                return None
            return original_first(queryset)

        with mock.patch.object(QuerySet, "first", autospec=True, side_effect=hide_default_on_initial_read):
            deck = _get_or_create_default_deck(user)

        self.assertEqual(deck.pk, concurrent_deck.pk)
        self.assertEqual(
            Deck.objects.filter(user=user, type=Deck.DeckType.USER, is_default=True).count(),
            1,
        )


class PublicApiSmokeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        root = Page.get_first_root_node()

        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)
        else:
            # L'API Wagtail v2 ne publie que les pages sous la racine du site.
            root = Site.objects.get(is_default_site=True).root_page

        index = MicroArticleIndexPage(title="Micro", slug="micro")
        root.add_child(instance=index)
        index.save_revision().publish()

        page = MicroArticlePage(
            title="Metformine",
            slug="metformine",
            answer_express="Elle améliore la sensibilité à l'insuline.",
            key_points=[
                {"type": "point", "value": "Diminue la production hépatique de glucose"},
                {"type": "point", "value": "Améliore la sensibilité périphérique"},
                {"type": "point", "value": "Ne provoque pas d'hypoglycémie seule"},
            ],
        )
        index.add_child(instance=page)
        page.save_revision().publish()

        page.tags.add("diabete")

        cat_root = CategoryPharmacologie.add_root(name="Diabète")
        cat_root.add_child(name="Biguanides")

    def test_content_list_smoke(self):
        resp = self.client.get("/api/v1/content/microarticles/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)
        self.assertIsInstance(resp.data["results"], list)
        self.assertTrue(resp.data["results"], "Expected at least one microarticle")

        first = resp.data["results"][0]
        self.assertIn("tags_payload", first)
        self.assertIn("published_at", first)

    def test_product_feed_remains_public(self):
        resp = self.client.get("/api/v1/feed/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)

    def test_wagtail_asset_lists_remain_public(self):
        for path in ("/api/v2/images/", "/api/v2/documents/"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path, secure=True).status_code, 200)

    def test_content_detail_smoke(self):
        resp = self.client.get("/api/v1/content/microarticles/metformine/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["slug"], "metformine")
        self.assertIn("questions", resp.data)
        self.assertIn("published_at", resp.data)

    def test_content_detail_exposes_authenticated_read_state(self):
        user = get_user_model().objects.create_user(
            username="detail-read-state",
            password="pharmapocket-test-pwd",
        )
        page = MicroArticlePage.objects.get(slug="metformine")
        LessonProgress.objects.create(
            user=user,
            lesson=page,
            seen=True,
            completed=True,
            percent=100,
            updated_at=timezone.now(),
        )
        self.client.force_authenticate(user)

        resp = self.client.get("/api/v1/content/microarticles/metformine/", secure=True)

        self.assertEqual(resp.status_code, 200)
        self.assertIs(resp.data["is_read"], True)

    def test_card_payload_is_shared_by_content_and_wagtail_v2(self):
        page = MicroArticlePage.objects.get(slug="metformine")
        expected = MicroArticleCardSerializer(page).data

        content_response = self.client.get(
            "/api/v1/content/microarticles/metformine/",
            secure=True,
        )
        self.assertEqual(content_response.status_code, 200)
        for field_name, value in expected.items():
            self.assertEqual(content_response.data[field_name], value)

        product_response = self.client.get("/api/v1/micro/metformine/", secure=True)
        self.assertEqual(product_response.status_code, 200)
        for field_name in (
            "id",
            "slug",
            "title",
            "answer_express",
            "takeaway",
            "key_points",
            "cover_image_url",
            "cover_image_credit",
            "published_at",
        ):
            self.assertEqual(product_response.data[field_name], expected[field_name])

        wagtail_response = self.client.get(f"/api/v2/pages/{page.id}/", secure=True)
        self.assertEqual(wagtail_response.status_code, 200)
        self.assertEqual(wagtail_response.data["answer_express"], expected["answer_express"])
        self.assertEqual(wagtail_response.data["takeaway"], expected["takeaway"])
        self.assertEqual(wagtail_response.data["api_key_points"], expected["key_points"])
        self.assertEqual(wagtail_response.data["api_cover"], None)
        self.assertEqual(
            wagtail_response.data["api_tags"],
            MicroArticleCardSerializer(page, fields=("tags_payload",)).data["tags_payload"],
        )

    def test_taxonomy_tree_smoke(self):
        resp = self.client.get("/api/v1/taxonomies/pharmacologie/tree/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["taxonomy"], "pharmacologie")
        self.assertIn("tree", resp.data)
        self.assertTrue(resp.data["tree"], "Expected non-empty taxonomy tree")

    def test_taxonomy_resolve_smoke(self):
        root_slug = slugify("Diabète")
        child_slug = slugify("Biguanides")
        resp = self.client.get(
            f"/api/v1/taxonomies/pharmacologie/resolve/?path={root_slug}/{child_slug}",
            secure=True,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["taxonomy"], "pharmacologie")
        self.assertIn("node_id", resp.data)
        self.assertIn("breadcrumb", resp.data)
        self.assertIn("canonical_path", resp.data)

    def test_tags_list_smoke(self):
        resp = self.client.get("/api/v1/tags/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(any(t["slug"] == "diabete" for t in resp.data))

        resp2 = self.client.get("/api/v1/tags/?q=dia&limit=5", secure=True)
        self.assertEqual(resp2.status_code, 200)
        self.assertLessEqual(len(resp2.data), 5)

    def test_content_list_tags_slug_only_validation(self):
        Tag.objects.get_or_create(name="not-slug", slug="not-slug")

        resp = self.client.get("/api/v1/content/microarticles/?tags=Not%20Slug", secure=True)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("tags", resp.data)
        self.assertIn("invalid", resp.data)

    def test_thumb_overrides_public_smoke(self):
        # The data migration already seeds this slug. Keep the test independent
        # of whether it ran against an empty database or the fully migrated one.
        PathologyThumbOverride.objects.update_or_create(
            pathology_slug="grippe",
            defaults={
                "bg": "#6D5BD0",
                "accent": "#D7D2FF",
                "pattern": PathologyThumbOverride.Pattern.WAVES,
            },
        )
        resp = self.client.get("/api/v1/content/thumb-overrides/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(any(r.get("pathology_slug") == "grippe" for r in resp.data))

    def test_admin_thumb_overrides_requires_auth(self):
        resp = self.client.get("/api/v1/content/admin/thumb-overrides/", secure=True)
        self.assertIn(resp.status_code, (401, 403))

    def test_rich_text_is_sanitized_before_it_reaches_the_api(self):
        page = MicroArticlePage.objects.get(slug="metformine")
        MicroArticlePage.objects.filter(id=page.id).update(
            answer_express=(
                '<p>Contenu <strong>fiable</strong></p>'
                '<img src=x onerror="alert(1)">'
                '<a href="javascript:alert(1)">Lien malveillant</a>'
            )
        )

        resp = self.client.get("/api/v1/content/microarticles/metformine/", secure=True)
        self.assertEqual(resp.status_code, 200)
        answer = resp.data["answer_express"]
        self.assertIn("<strong>fiable</strong>", answer)
        self.assertNotIn("<img", answer)
        self.assertNotIn("onerror", answer)
        self.assertNotIn("javascript:", answer)

    def test_published_deck_does_not_expose_unpublished_card(self):
        index = MicroArticleIndexPage.objects.first()
        assert index is not None
        draft = MicroArticlePage(
            title="Brouillon interne",
            slug="brouillon-interne",
            live=False,
        )
        index.add_child(instance=draft)

        deck = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
            name="Pack public",
        )
        DeckCard.objects.create(deck=deck, microarticle=draft)

        detail = self.client.get(f"/api/v1/content/decks/{deck.id}/", secure=True)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["cards_count"], 0)
        self.assertEqual(detail.data["cards"], [])

        cards = self.client.get(f"/api/v1/content/decks/{deck.id}/cards/", secure=True)
        self.assertEqual(cards.status_code, 200)
        self.assertEqual(cards.data["count"], 0)

        listing = self.client.get("/api/v1/content/decks/?type=official", secure=True)
        self.assertEqual(listing.status_code, 200)
        listed_deck = next(item for item in listing.data if item["id"] == deck.id)
        self.assertEqual(listed_deck["cards_count"], 0)


class StaffPermissionTests(APITestCase):
    ADMIN_VIEWS = (
        AdminImageUploadView,
        AdminMicroArticleSearchView,
        AdminPackBulkAddView,
        AdminPackDetailView,
        AdminPackListCreateView,
        AdminPackRemoveCardView,
        AdminPackReorderCardsView,
        AdminThumbOverrideDetailView,
        AdminThumbOverrideListCreateView,
        SubjectCardDetailView,
        SubjectCardsReorderView,
        SubjectCardsView,
    )

    def test_admin_views_use_the_shared_staff_permission(self):
        for view in self.ADMIN_VIEWS:
            with self.subTest(view=view.__name__):
                self.assertEqual(view.permission_classes, [IsStaff])

    def test_subject_writes_use_staff_permission_but_reads_remain_public(self):
        subject = Subject.objects.create(name="Sujet public", slug="sujet-public")

        self.assertEqual(SubjectListCreateView.permission_classes, [IsStaff])
        self.assertEqual(SubjectDetailView.permission_classes, [IsStaff])
        self.assertEqual(self.client.get("/api/v1/content/subjects/", secure=True).status_code, 200)
        self.assertEqual(
            self.client.get(
                f"/api/v1/content/subjects/{subject.slug}/",
                secure=True,
            ).status_code,
            200,
        )

        member = get_user_model().objects.create_user(
            username="member-subjects",
            email="member-subjects@example.com",
            password="pharmapocket-test-pwd",
        )
        self.client.force_authenticate(user=member)

        self.assertEqual(
            self.client.post(
                "/api/v1/content/subjects/",
                {"name": "Interdit"},
                format="json",
                secure=True,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v1/content/subjects/{subject.slug}/",
                {"description": "Interdit"},
                format="json",
                secure=True,
            ).status_code,
            403,
        )


def _png_bytes(size: tuple[int, int] = (8, 8)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (255, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


class AdminImageUploadTests(APITestCase):
    """The admin upload API skips the Wagtail form, so it must validate on its own."""

    URL = "/api/v1/content/admin/images/upload/"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root = tempfile.mkdtemp()
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.staff = get_user_model().objects.create_user(
            username="staff-upload",
            email="staff-upload@example.com",
            password="pharmapocket-test-pwd",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.staff)

    def test_valid_png_is_accepted(self):
        upload = SimpleUploadedFile("cover.png", _png_bytes(), content_type="image/png")
        resp = self.client.post(self.URL, {"file": upload}, format="multipart", secure=True)

        self.assertEqual(resp.status_code, 201)
        self.assertEqual(get_image_model().objects.count(), 1)

    def test_non_image_disguised_as_png_is_rejected(self):
        upload = SimpleUploadedFile(
            "payload.png",
            b"MZ\x90\x00 not an image at all",
            content_type="image/png",
        )
        resp = self.client.post(self.URL, {"file": upload}, format="multipart", secure=True)

        self.assertEqual(resp.status_code, 400)
        self.assertIn("file", resp.data)
        self.assertEqual(get_image_model().objects.count(), 0)


    def test_disallowed_extension_is_rejected(self):
        # Real PNG bytes, but an extension outside WAGTAILIMAGES_EXTENSIONS (SVG = stored XSS).
        upload = SimpleUploadedFile("cover.svg", _png_bytes(), content_type="image/svg+xml")
        resp = self.client.post(self.URL, {"file": upload}, format="multipart", secure=True)

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(get_image_model().objects.count(), 0)

    @override_settings(WAGTAILIMAGES_MAX_UPLOAD_SIZE=256)
    def test_oversized_image_is_rejected(self):
        upload = SimpleUploadedFile("big.png", _png_bytes((512, 512)), content_type="image/png")
        resp = self.client.post(self.URL, {"file": upload}, format="multipart", secure=True)

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(get_image_model().objects.count(), 0)

    def test_upload_requires_staff(self):
        self.client.force_authenticate(
            user=get_user_model().objects.create_user(
                username="member-upload",
                email="member-upload@example.com",
                password="pharmapocket-test-pwd",
            )
        )
        upload = SimpleUploadedFile("cover.png", _png_bytes(), content_type="image/png")
        resp = self.client.post(self.URL, {"file": upload}, format="multipart", secure=True)

        self.assertEqual(resp.status_code, 403)
        self.assertEqual(get_image_model().objects.count(), 0)


class DeckCardQueryCountTests(APITestCase):
    """Les vues qui sérialisent des DeckCard en boucle ne doivent pas faire de N+1 sur les tags."""

    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro queries", slug="micro-queries")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.user = get_user_model().objects.create_user(
            username="deck-queries",
            email="deck-queries@example.com",
            password="pharmapocket-test-pwd",
        )
        self.client.force_authenticate(user=self.user)

        self.deck = Deck.objects.create(
            user=self.user,
            type=Deck.DeckType.USER,
            name="Mes cartes",
            is_default=True,
            sort_order=0,
        )
        self.card_count = 0

    def _add_cards(self, count: int):
        for _ in range(count):
            self.card_count += 1
            n = self.card_count
            page = MicroArticlePage(
                title=f"Carte {n}",
                slug=f"carte-{n}",
                answer_express=f"Réponse {n}.",
            )
            self.index.add_child(instance=page)
            # Plusieurs tags par carte : un N+1 sur les tags coûterait 1 requête par carte.
            page.tags.add(f"tag-a-{n}", f"tag-b-{n}")
            page.save()
            page.save_revision().publish()
            DeckCard.objects.create(deck=self.deck, microarticle=page, sort_order=n)

    def _query_count(self, url: str) -> int:
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get(url, secure=True)
        self.assertEqual(resp.status_code, 200)
        return len(ctx)

    def _assert_constant_query_count(self, url: str):
        self._add_cards(2)
        with_two = self._query_count(url)
        self._add_cards(4)
        with_six = self._query_count(url)
        self.assertEqual(
            with_two,
            with_six,
            f"{url} : {with_two} requêtes pour 2 cartes vs {with_six} pour 6 → N+1",
        )

    def test_deck_cards_query_count_is_constant(self):
        self._assert_constant_query_count(f"/api/v1/content/decks/{self.deck.id}/cards/")

    def test_deck_detail_query_count_is_constant(self):
        self._assert_constant_query_count(f"/api/v1/content/decks/{self.deck.id}/")

    def test_saved_list_query_count_is_constant(self):
        self._assert_constant_query_count("/api/v1/content/saved/")

    def test_tags_are_still_serialized(self):
        self._add_cards(1)
        resp = self.client.get(f"/api/v1/content/decks/{self.deck.id}/cards/", secure=True)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(sorted(resp.data["results"][0]["tags"]), ["tag-a-1", "tag-b-1"])


class SubjectListQueryCountTests(APITestCase):
    """La liste des sujets doit annoter cards_count / has_recap au lieu de compter par sujet."""

    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro subjects", slug="micro-subjects")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.subject_count = 0

    def _add_subjects(self, count: int):
        for _ in range(count):
            self.subject_count += 1
            n = self.subject_count
            subject = Subject.objects.create(name=f"Sujet {n}", slug=f"sujet-{n}")
            for card_type in (CardType.RECAP, CardType.DETAIL):
                page = MicroArticlePage(
                    title=f"Carte {n} {card_type}",
                    slug=f"carte-sujet-{n}-{card_type}",
                    answer_express=f"Réponse {n}.",
                    card_type=card_type,
                )
                self.index.add_child(instance=page)
                page.save_revision().publish()
                SubjectCard.objects.create(subject=subject, microarticle=page)

    def _query_count(self) -> int:
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get("/api/v1/content/subjects/", secure=True)
        self.assertEqual(resp.status_code, 200)
        return len(ctx)

    def test_subject_list_query_count_is_constant(self):
        self._add_subjects(2)
        with_two = self._query_count()
        self._add_subjects(4)
        with_six = self._query_count()
        self.assertEqual(
            with_two,
            with_six,
            f"subjects/ : {with_two} requêtes pour 2 sujets vs {with_six} pour 6 → N+1",
        )

    def test_annotations_match_previous_values(self):
        self._add_subjects(1)
        subject_without_recap = Subject.objects.create(name="Sans récap", slug="sans-recap")
        page = MicroArticlePage(
            title="Détail seul",
            slug="detail-seul",
            answer_express="Réponse.",
            card_type=CardType.DETAIL,
        )
        self.index.add_child(instance=page)
        page.save_revision().publish()
        SubjectCard.objects.create(subject=subject_without_recap, microarticle=page)

        resp = self.client.get("/api/v1/content/subjects/", secure=True)
        self.assertEqual(resp.status_code, 200)

        by_slug = {item["slug"]: item for item in resp.data}
        self.assertEqual(by_slug["sujet-1"]["cards_count"], 2)
        self.assertTrue(by_slug["sujet-1"]["has_recap"])
        self.assertEqual(by_slug["sans-recap"]["cards_count"], 1)
        self.assertFalse(by_slug["sans-recap"]["has_recap"])


class BulkWriteQueryCountTests(APITestCase):
    """Les écritures en lot (reorder, bulk-add) ne doivent pas faire 1 requête par carte."""

    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro bulk", slug="micro-bulk")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.user = get_user_model().objects.create_user(
            username="bulk-staff",
            email="bulk-staff@example.com",
            password="pharmapocket-test-pwd",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.user)

        self.page_count = 0

    def _make_pages(self, count: int) -> list[MicroArticlePage]:
        pages = []
        for _ in range(count):
            self.page_count += 1
            n = self.page_count
            page = MicroArticlePage(
                title=f"Carte bulk {n}",
                slug=f"carte-bulk-{n}",
                answer_express=f"Réponse {n}.",
            )
            self.index.add_child(instance=page)
            page.save_revision().publish()
            pages.append(page)
        return pages

    def _post_query_count(self, url: str, payload: dict) -> int:
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.post(url, payload, format="json", secure=True)
        self.assertEqual(resp.status_code, 200, resp.data)
        return len(ctx)

    # --- Subject reorder -------------------------------------------------

    def _subject_with_cards(self, slug: str, count: int) -> Subject:
        subject = Subject.objects.create(name=slug, slug=slug)
        for page in self._make_pages(count):
            SubjectCard.objects.create(subject=subject, microarticle=page)
        return subject

    def _reorder_query_count(self, subject: Subject) -> int:
        ids = list(
            subject.subject_cards.order_by("sort_order", "id").values_list("id", flat=True)
        )
        # Ordre inversé : chaque carte change de position, donc chaque carte doit être écrite.
        return self._post_query_count(
            f"/api/v1/content/subjects/{subject.slug}/cards/reorder/",
            {"order": list(reversed(ids))},
        )

    def test_subject_reorder_query_count_is_constant(self):
        with_two = self._reorder_query_count(self._subject_with_cards("reorder-2", 2))
        with_six = self._reorder_query_count(self._subject_with_cards("reorder-6", 6))
        self.assertEqual(
            with_two,
            with_six,
            f"reorder : {with_two} requêtes pour 2 cartes vs {with_six} pour 6 → écriture en boucle",
        )

    def test_subject_reorder_applies_the_requested_order(self):
        subject = self._subject_with_cards("reorder-apply", 3)
        ids = list(
            subject.subject_cards.order_by("sort_order", "id").values_list("id", flat=True)
        )
        expected = [ids[2], ids[0], ids[1]]

        resp = self.client.post(
            f"/api/v1/content/subjects/{subject.slug}/cards/reorder/",
            {"order": expected},
            format="json",
            secure=True,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["updated"], 3)
        self.assertEqual(
            list(subject.subject_cards.order_by("sort_order", "id").values_list("id", flat=True)),
            expected,
        )

    def test_subject_reorder_ignores_unknown_ids(self):
        subject = self._subject_with_cards("reorder-unknown", 2)
        ids = list(
            subject.subject_cards.order_by("sort_order", "id").values_list("id", flat=True)
        )

        resp = self.client.post(
            f"/api/v1/content/subjects/{subject.slug}/cards/reorder/",
            {"order": [999999, ids[1], ids[0]]},
            format="json",
            secure=True,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            list(subject.subject_cards.order_by("sort_order", "id").values_list("id", flat=True)),
            [ids[1], ids[0]],
        )

    # --- Pack bulk-add ---------------------------------------------------

    def _official_pack(self, name: str) -> Deck:
        return Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            name=name,
            sort_order=0,
        )

    def _bulk_add_query_count(self, count: int) -> int:
        deck = self._official_pack(f"pack-bulk-{count}")
        pages = self._make_pages(count)
        return self._post_query_count(
            f"/api/v1/content/admin/packs/{deck.id}/bulk-add/",
            {"microarticle_ids": [p.id for p in pages]},
        )

    def test_bulk_add_query_count_is_constant(self):
        with_two = self._bulk_add_query_count(2)
        with_six = self._bulk_add_query_count(6)
        self.assertEqual(
            with_two,
            with_six,
            f"bulk-add : {with_two} requêtes pour 2 cartes vs {with_six} pour 6 → écriture en boucle",
        )

    def test_bulk_add_resolves_ids_slugs_and_reports_counts(self):
        deck = self._official_pack("pack-bulk-mixed")
        by_id, by_slug, already = self._make_pages(3)
        DeckCard.objects.create(deck=deck, microarticle=already, sort_order=0)

        resp = self.client.post(
            f"/api/v1/content/admin/packs/{deck.id}/bulk-add/",
            {
                "items": f"{by_id.id}\n{by_slug.slug}\n{already.slug}\ninconnu-xyz\n{by_id.id}",
            },
            format="json",
            secure=True,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["added"], 2)
        # already.slug + le doublon de by_id.id
        self.assertEqual(resp.data["already_present"], 2)
        self.assertEqual(resp.data["not_found"], 1)

        links = list(DeckCard.objects.filter(deck=deck).order_by("sort_order", "id"))
        self.assertEqual(
            [link.microarticle_id for link in links],
            [already.id, by_id.id, by_slug.id],
        )
        self.assertEqual([link.sort_order for link in links], [0, 1, 2])


class OfficialDeckProgressPayloadTests(APITestCase):
    """Les 4 endpoints qui exposent la progression partagent `build_progress_payload`."""

    PROGRESS_FIELDS = (
        "started_at",
        "last_seen_at",
        "cards_seen_count",
        "cards_done_count",
        "progress_pct",
        "mode_last",
        "last_card_id",
    )

    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro progress", slug="micro-progress")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.user = get_user_model().objects.create_user(
            username="deck-progress",
            email="deck-progress@example.com",
            password="pharmapocket-test-pwd",
        )
        self.client.force_authenticate(user=self.user)

        self.deck = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
            name="Pack progression",
            sort_order=0,
        )
        self.cards = []
        for n in range(4):
            page = MicroArticlePage(
                title=f"Progress {n}",
                slug=f"progress-{n}",
                answer_express=f"Réponse {n}.",
            )
            self.index.add_child(instance=page)
            page.save_revision().publish()
            DeckCard.objects.create(deck=self.deck, microarticle=page, sort_order=n)
            self.cards.append(page)

    def _payloads(self) -> dict[str, dict]:
        listing = self.client.get("/api/v1/content/decks/?type=official", secure=True)
        self.assertEqual(listing.status_code, 200)
        listed = next(item for item in listing.data if item["id"] == self.deck.id)

        detail = self.client.get(f"/api/v1/content/decks/{self.deck.id}/", secure=True)
        self.assertEqual(detail.status_code, 200)

        start = self.client.post(f"/api/v1/content/decks/{self.deck.id}/start/", secure=True)
        self.assertEqual(start.status_code, 200)

        progress = self.client.post(
            f"/api/v1/content/decks/{self.deck.id}/progress/",
            {},
            format="json",
            secure=True,
        )
        self.assertEqual(progress.status_code, 200)

        return {
            "list": listed["progress"],
            "detail": detail.data["progress"],
            "start": start.data,
            "progress": progress.data,
        }

    def _assert_all_agree(self, expected: dict):
        for name, payload in self._payloads().items():
            for field, value in expected.items():
                self.assertEqual(payload[field], value, f"{name}.{field}")

    def test_progress_is_none_before_any_start(self):
        listing = self.client.get("/api/v1/content/decks/?type=official", secure=True)
        listed = next(item for item in listing.data if item["id"] == self.deck.id)
        self.assertIsNone(listed["progress"])

        detail = self.client.get(f"/api/v1/content/decks/{self.deck.id}/", secure=True)
        self.assertIsNone(detail.data["progress"])

    def test_counts_and_pct_are_identical_on_every_endpoint(self):
        self.client.post(f"/api/v1/content/decks/{self.deck.id}/start/", secure=True)
        self.client.post(
            f"/api/v1/content/decks/{self.deck.id}/progress/",
            {"cards_seen_count": 3, "cards_done_count": 1},
            format="json",
            secure=True,
        )

        # effective = max(done, seen) = 3 sur 4 cartes.
        self._assert_all_agree({"cards_seen_count": 3, "cards_done_count": 1, "progress_pct": 75})

        payloads = self._payloads()
        for name, payload in payloads.items():
            self.assertEqual(
                sorted(f for f in payload if f != "deck_id"),
                sorted(self.PROGRESS_FIELDS),
                f"{name} : champs de progression divergents",
            )

    def test_seen_count_is_backfilled_from_last_card_id_everywhere(self):
        # Progression enregistrée sans compteur : seul last_card_id est connu.
        self.client.post(f"/api/v1/content/decks/{self.deck.id}/start/", secure=True)
        UserDeckProgress.objects.filter(user=self.user, deck=self.deck).update(
            cards_seen_count=0,
            cards_done_count=0,
            last_card=self.cards[2],
        )

        # 3e carte (sort_order=2) → 3 cartes vues sur 4.
        self._assert_all_agree({"cards_seen_count": 3, "progress_pct": 75})

    def test_deck_list_progress_query_count_is_constant(self):
        self.client.post(f"/api/v1/content/decks/{self.deck.id}/start/", secure=True)
        UserDeckProgress.objects.filter(user=self.user, deck=self.deck).update(
            cards_seen_count=0,
            last_card=self.cards[2],
        )
        url = "/api/v1/content/decks/?type=official"

        def count() -> int:
            with CaptureQueriesContext(connection) as ctx:
                resp = self.client.get(url, secure=True)
            self.assertEqual(resp.status_code, 200)
            return len(ctx)

        with_one = count()

        other = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
            name="Pack progression 2",
            sort_order=1,
        )
        DeckCard.objects.create(deck=other, microarticle=self.cards[0], sort_order=0)
        UserDeckProgress.objects.create(
            user=self.user,
            deck=other,
            cards_seen_count=0,
            last_card=self.cards[0],
        )

        self.assertEqual(
            with_one,
            count(),
            "le rattrapage de cards_seen_count doit rester groupé (pas de requête par deck)",
        )


class MicroArticleSearchTests(APITestCase):
    """La recherche passe par l'index Wagtail, plus par des `icontains`.

    L'indexation est déclenchée au `save()` d'une page mais différée au commit
    (django-tasks, `ENQUEUE_ON_COMMIT`), qui n'a jamais lieu dans un `TestCase` :
    d'où le `captureOnCommitCallbacks` autour de chaque écriture indexée.
    """

    FEED_URL = "/api/v1/content/microarticles/"
    ADMIN_URL = "/api/v1/content/admin/microarticles/search/"

    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro search", slug="micro-search")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.metformine = self._add_page(
            title="Metformine",
            slug="metformine",
            answer_express="<p>Antidiabétique oral de première intention.</p>",
            key_points=[
                {"type": "point", "value": "Ne provoque pas d'hypoglycémie seule"},
            ],
            see_more=[
                {"type": "detail", "value": "<p>Risque rare d'acidose lactique.</p>"},
            ],
        )
        self.insuline = self._add_page(
            title="Insulines lentes",
            slug="insulines-lentes",
            answer_express="<p>Analogues à durée d'action prolongée.</p>",
        )
        self.staff = get_user_model().objects.create_user(
            username="staff-search",
            email="staff-search@example.com",
            password="pharmapocket-test-pwd",
            is_staff=True,
        )

    def _add_page(self, **kwargs) -> MicroArticlePage:
        with self.captureOnCommitCallbacks(execute=True):
            page = MicroArticlePage(**kwargs)
            self.index.add_child(instance=page)
            page.save_revision().publish()
        return page

    def _feed_slugs(self, query: str, **params) -> list[str]:
        params["q"] = query
        resp = self.client.get(self.FEED_URL, params, secure=True)
        self.assertEqual(resp.status_code, 200)
        return [item["slug"] for item in resp.data["results"]]

    def _admin_slugs(self, query: str) -> list[str]:
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get(self.ADMIN_URL, {"q": query}, secure=True)
        self.assertEqual(resp.status_code, 200)
        return [row["slug"] for row in resp.data]

    def test_feed_search_matches_word_variants(self):
        # `icontains` ne trouvait rien : la fiche s'intitule « Insulines lentes ».
        self.assertEqual(self._feed_slugs("insuline"), ["insulines-lentes"])

    def test_feed_search_ignores_accents(self):
        self.assertEqual(self._feed_slugs("antidiabetique"), ["metformine"])
        self.assertEqual(self._feed_slugs("hypoglycémie"), ["metformine"])

    def test_feed_search_matches_stream_field_content(self):
        # « acidose » n'existe que dans le StreamField `see_more`, invisible aux `icontains`.
        self.assertEqual(self._feed_slugs("acidose"), ["metformine"])

    def test_feed_search_falls_back_to_a_prefix_when_no_whole_word_matches(self):
        # « insulin » n'est un mot d'aucune fiche : sans ce repli, la page serait vide.
        self.assertEqual(self._feed_slugs("insulin"), ["insulines-lentes"])

    def test_feed_search_excludes_non_matching_pages(self):
        self.assertEqual(self._feed_slugs("metformine"), ["metformine"])
        self.assertEqual(self._feed_slugs("mot-totalement-absent"), [])

    def test_feed_search_still_combines_with_other_filters(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.metformine.tags.add("diabete")
            self.metformine.save()

        self.assertEqual(self._feed_slugs("metformine", tags="diabete"), ["metformine"])
        self.assertEqual(self._feed_slugs("insuline", tags="diabete"), [])

    def test_feed_search_ignores_unpublished_pages(self):
        draft = self._add_page(title="Metformine brouillon", slug="metformine-brouillon")
        with self.captureOnCommitCallbacks(execute=True):
            draft.live = False
            draft.save()

        self.assertEqual(self._feed_slugs("metformine"), ["metformine"])

    def test_feed_search_runs_a_single_index_query(self):
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get(self.FEED_URL, {"q": "insuline"}, secure=True)
        self.assertEqual(resp.status_code, 200)

        index_queries = [q for q in ctx.captured_queries if "indexentry" in q["sql"].lower()]
        self.assertEqual(len(index_queries), 1, "la recherche doit tenir en une requête sur l'index")

    def test_admin_search_matches_a_prefix_being_typed(self):
        # Le sélecteur du back-office interroge l'API à chaque frappe.
        self.assertEqual(self._admin_slugs("metfor"), ["metformine"])
        self.assertEqual(self._admin_slugs("insulines le"), ["insulines-lentes"])

    def test_admin_search_matches_a_slug_fragment(self):
        self.assertEqual(self._admin_slugs("insulines-lentes"), ["insulines-lentes"])

    def test_admin_search_ignores_accents(self):
        self.assertEqual(self._admin_slugs("métfor"), ["metformine"])

    def test_search_falls_back_to_icontains_when_the_backend_fails(self):
        with (
            mock.patch(
                "modelsearch.queryset.get_search_backend",
                side_effect=RuntimeError("backend down"),
            ),
            self.assertLogs("content.search", level="ERROR"),
        ):
            self.assertEqual(self._feed_slugs("Metformine"), ["metformine"])
            self.assertEqual(self._admin_slugs("insulines-lentes"), ["insulines-lentes"])


class InputSerializerValidationTests(APITestCase):
    """Validation des corps de requête déléguée aux serializers d'entrée.

    Deux choses sont vérifiées : le format des 400 (toujours
    `{"champ": ["message"]}`) et les cas que la validation manuelle laissait
    filer jusqu'à la base.
    """

    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro validation", slug="micro-validation")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.card = self._add_page("Carte validee", "carte-validee")

        self.staff = get_user_model().objects.create_user(
            username="validation-staff",
            email="validation-staff@example.com",
            password="pharmapocket-test-pwd",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.staff)

    def _add_page(self, title: str, slug: str, card_type: str = CardType.DETAIL) -> MicroArticlePage:
        page = MicroArticlePage(
            title=title,
            slug=slug,
            answer_express=f"Reponse {slug}.",
            card_type=card_type,
        )
        self.index.add_child(instance=page)
        page.save_revision().publish()
        return page

    def _post(self, url: str, payload):
        return self.client.post(url, payload, format="json", secure=True)

    def _patch(self, url: str, payload):
        return self.client.patch(url, payload, format="json", secure=True)

    def assertFieldError(self, resp, field: str, message: str):
        """Un 400 DRF : la clé porte une *liste* de messages."""
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn(field, resp.data)
        self.assertIsInstance(resp.data[field], list, resp.data)
        self.assertIn(message, [str(m) for m in resp.data[field]])

    # --- Decks -------------------------------------------------------------

    def test_deck_create_rejects_a_blank_name(self):
        self.assertFieldError(
            self._post("/api/v1/content/decks/", {"name": "   "}), "name", "name is required"
        )
        self.assertFieldError(self._post("/api/v1/content/decks/", {}), "name", "name is required")

    def test_deck_create_rejects_a_name_longer_than_the_column(self):
        # `Deck.name` est un CharField(max_length=60) : sans le serializer, la
        # base refusait la valeur, donc 500 au lieu de 400.
        resp = self._post("/api/v1/content/decks/", {"name": "x" * 61})

        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn("name", resp.data)
        self.assertFalse(Deck.objects.filter(name="x" * 61).exists())

    def test_deck_patch_needs_a_known_field(self):
        self._post("/api/v1/content/decks/", {"name": "Revisions"})
        deck = Deck.objects.get(user=self.staff, name="Revisions")

        self.assertFieldError(
            self._patch(f"/api/v1/content/decks/{deck.id}/", {"inconnu": 1}),
            "detail",
            "No fields to update",
        )
        self.assertFieldError(
            self._patch(f"/api/v1/content/decks/{deck.id}/", {"sort_order": "abc"}),
            "sort_order",
            "sort_order must be an integer",
        )

    def test_deck_patch_applies_the_submitted_fields(self):
        self._post("/api/v1/content/decks/", {"name": "Avant"})
        deck = Deck.objects.get(user=self.staff, name="Avant")

        resp = self._patch(f"/api/v1/content/decks/{deck.id}/", {"name": "Apres", "sort_order": 7})

        self.assertEqual(resp.status_code, 200, resp.data)
        deck.refresh_from_db()
        self.assertEqual((deck.name, deck.sort_order), ("Apres", 7))

    def test_deck_add_card_separates_bad_type_from_unknown_card(self):
        self._post("/api/v1/content/decks/", {"name": "Cible"})
        deck = Deck.objects.get(user=self.staff, name="Cible")
        url = f"/api/v1/content/decks/{deck.id}/cards/"

        self.assertFieldError(self._post(url, {"card_id": "abc"}), "card_id", "card_id must be an integer")
        self.assertFieldError(self._post(url, {}), "card_id", "card_id is required")
        self.assertFieldError(
            self._post(url, {"card_id": 999999}), "card_id", "Unknown or unavailable card"
        )
        self.assertEqual(self._post(url, {"card_id": self.card.id}).status_code, 200)

    def test_deck_bulk_add_requires_a_list(self):
        self._post("/api/v1/content/decks/", {"name": "Lot"})
        deck = Deck.objects.get(user=self.staff, name="Lot")
        url = f"/api/v1/content/decks/{deck.id}/cards/bulk-add/"

        self.assertFieldError(self._post(url, {"card_ids": "12"}), "card_ids", "card_ids must be a list")
        self.assertFieldError(self._post(url, {}), "card_ids", "card_ids must be a list")

        resp = self._post(url, {"card_ids": [self.card.id, self.card.id]})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["added"], 1)

    def test_card_decks_put_requires_a_list(self):
        resp = self.client.put(
            f"/api/v1/content/cards/{self.card.id}/decks/",
            {"deck_ids": "1"},
            format="json",
            secure=True,
        )
        self.assertFieldError(resp, "deck_ids", "deck_ids must be a list")

    # --- Progression d'un pack officiel ------------------------------------

    def _official_pack_with_card(self) -> Deck:
        pack = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
            name="Pack progression",
            sort_order=0,
        )
        DeckCard.objects.create(deck=pack, microarticle=self.card, sort_order=0)
        return pack

    def test_progress_rejects_a_card_outside_the_deck(self):
        pack = self._official_pack_with_card()
        outsider = self._add_page("Hors pack", "hors-pack")

        self.assertFieldError(
            self._post(f"/api/v1/content/decks/{pack.id}/progress/", {"last_card_id": outsider.id}),
            "last_card_id",
            "Unknown or unavailable card in this deck",
        )
        self.assertFieldError(
            self._post(f"/api/v1/content/decks/{pack.id}/progress/", {"last_card_id": "abc"}),
            "last_card_id",
            "last_card_id must be an integer",
        )

    def test_progress_clamps_negative_counters(self):
        pack = self._official_pack_with_card()

        resp = self._post(
            f"/api/v1/content/decks/{pack.id}/progress/",
            {"cards_seen_count": -5, "cards_done_count": -1, "mode_last": "shuffle"},
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["cards_seen_count"], 0)
        self.assertEqual(resp.data["cards_done_count"], 0)
        self.assertEqual(resp.data["mode_last"], "shuffle")

    def test_progress_rejects_an_unknown_mode(self):
        # La validation manuelle ignorait silencieusement un mode inconnu.
        pack = self._official_pack_with_card()

        resp = self._post(f"/api/v1/content/decks/{pack.id}/progress/", {"mode_last": "aleatoire"})

        self.assertFieldError(resp, "mode_last", "invalid mode_last")
        self.assertFalse(UserDeckProgress.objects.filter(deck=pack).exists())

    # --- Sauvegardes et état de lecture -------------------------------------

    def test_saved_post_rejects_an_unknown_slug(self):
        self.assertFieldError(
            self._post("/api/v1/content/saved/", {"slug": "nexiste-pas"}),
            "slug",
            "Unknown microarticle",
        )
        self.assertFieldError(self._post("/api/v1/content/saved/", {}), "slug", "slug is required")
        self.assertEqual(
            self._post("/api/v1/content/saved/", {"slug": self.card.slug}).status_code, 200
        )

    def test_read_state_requires_slugs(self):
        self.assertFieldError(
            self._post("/api/v1/content/read-state/", {}),
            "slugs",
            "slugs is required (list of slugs)",
        )
        self.assertFieldError(
            self._post("/api/v1/content/read-state/", {"slugs": self.card.slug}),
            "slugs",
            "slugs is required (list of slugs)",
        )

    def test_read_state_rejects_an_oversized_batch(self):
        # Le corps de requete leve la limite de longueur d'URL, pas celle du
        # `IN (...)` : le client doit decouper en lots.
        resp = self._post(
            "/api/v1/content/read-state/",
            {"slugs": [f"fiche-{i}" for i in range(READ_STATE_MAX_SLUGS + 1)]},
        )

        self.assertFieldError(
            resp, "slugs", f"slugs must contain at most {READ_STATE_MAX_SLUGS} items"
        )

    def test_read_state_is_derived_from_lesson_progress(self):
        other = self._add_page("Non lue", "non-lue")
        progress = LessonProgress.objects.create(
            user=self.staff,
            lesson=self.card,
            seen=True,
            completed=True,
            percent=100,
            updated_at=timezone.now(),
        )

        body = {"slugs": [self.card.slug, other.slug, "fiche-inconnue"]}

        resp = self._post("/api/v1/content/read-state/", body)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(
            resp.data["items"],
            {self.card.slug: True, other.slug: False, "fiche-inconnue": False},
        )

        # Repasser la lecon en « non terminee » suffit a repasser la fiche en non lue :
        # il n'y a plus d'etat de lecture stocke a part.
        progress.completed = False
        progress.save(update_fields=["completed"])

        resp = self._post("/api/v1/content/read-state/", body)
        self.assertEqual(resp.data["items"][self.card.slug], False)

    # --- Overrides de vignettes ---------------------------------------------

    def test_thumb_override_create_validates_colors_pattern_and_unicity(self):
        url = "/api/v1/content/admin/thumb-overrides/"
        # Slug volontairement absent des overrides posés par la migration de données.
        valid = {
            "pathology_slug": "Pathologie De Test",
            "bg": "#6D5BD0",
            "accent": "#D7D2FF",
            "pattern": "waves",
        }

        self.assertFieldError(
            self._post(url, {**valid, "bg": "6D5BD0"}), "bg", "bg must be a hex color (ex: #6D5BD0)"
        )
        self.assertFieldError(
            self._post(url, {**valid, "accent": 12}),
            "accent",
            "accent must be a hex color (ex: #D7D2FF)",
        )
        self.assertFieldError(
            self._post(url, {**valid, "pattern": "spirales"}), "pattern", "invalid pattern"
        )
        self.assertFieldError(
            self._post(url, {**valid, "pathology_slug": "###"}),
            "pathology_slug",
            "Invalid pathology_slug",
        )

        resp = self._post(url, valid)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["pathology_slug"], "pathologie-de-test")

        self.assertFieldError(self._post(url, valid), "pathology_slug", "pathology_slug already exists")

    def test_thumb_override_patch_updates_only_the_submitted_fields(self):
        override = PathologyThumbOverride.objects.create(
            pathology_slug="grippe-patch",
            bg="#6D5BD0",
            accent="#D7D2FF",
            pattern=PathologyThumbOverride.Pattern.WAVES,
        )
        url = f"/api/v1/content/admin/thumb-overrides/{override.pathology_slug}/"

        self.assertFieldError(self._patch(url, {}), "detail", "No fields to update")

        resp = self._patch(url, {"bg": "#000000"})

        self.assertEqual(resp.status_code, 200, resp.data)
        override.refresh_from_db()
        self.assertEqual(override.bg, "#000000")
        self.assertEqual(override.accent, "#D7D2FF")
        self.assertEqual(override.pathology_slug, "grippe-patch")

    # --- Sujets --------------------------------------------------------------

    def test_subject_create_derives_the_slug_and_refuses_duplicates(self):
        url = "/api/v1/content/subjects/"

        self.assertFieldError(self._post(url, {"name": "  "}), "name", "name is required")

        resp = self._post(url, {"name": "Insuffisance renale"})
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["slug"], "insuffisance-renale")
        self.assertEqual(resp.data["description"], "")

        self.assertFieldError(
            self._post(url, {"name": "Autre", "slug": "insuffisance-renale"}),
            "slug",
            "slug already exists",
        )
        # Un nom qui ne produit aucun slug : 400 plutôt qu'une ligne au slug vide.
        self.assertFieldError(self._post(url, {"name": "###"}), "slug", "Invalid slug")

    def test_subject_patch_requires_a_known_field(self):
        subject = Subject.objects.create(name="Sujet patch", slug="sujet-patch")
        url = f"/api/v1/content/subjects/{subject.slug}/"

        self.assertFieldError(self._patch(url, {"inconnu": 1}), "detail", "No fields to update")
        self.assertFieldError(self._patch(url, {"slug": "###"}), "slug", "Invalid slug")

        resp = self._patch(url, {"description": None})

        self.assertEqual(resp.status_code, 200, resp.data)
        subject.refresh_from_db()
        self.assertEqual(subject.description, "")

    def test_subject_add_card_validates_the_slug_and_recap_unicity(self):
        subject = Subject.objects.create(name="Sujet cartes", slug="sujet-cartes")
        url = f"/api/v1/content/subjects/{subject.slug}/cards/"

        self.assertFieldError(self._post(url, {}), "card_slug", "card_slug is required")
        self.assertFieldError(self._post(url, {"card_slug": "inconnu"}), "card_slug", "Unknown card")

        recap = self._add_page("Recap 1", "recap-1", card_type=CardType.RECAP)
        other_recap = self._add_page("Recap 2", "recap-2", card_type=CardType.RECAP)
        self.assertEqual(self._post(url, {"card_slug": recap.slug}).status_code, 201)
        self.assertFieldError(
            self._post(url, {"card_slug": other_recap.slug}),
            "card_slug",
            "Subject already has a recap card",
        )

    def test_subject_card_patch_rejects_a_non_integer_order(self):
        # Un `sort_order` non entier était ignoré en silence, donc un 200 trompeur.
        subject = Subject.objects.create(name="Sujet ordre", slug="sujet-ordre")
        link = SubjectCard.objects.create(subject=subject, microarticle=self.card)
        url = f"/api/v1/content/subjects/{subject.slug}/cards/{link.id}/"

        self.assertFieldError(
            self._patch(url, {"sort_order": "deuxieme"}),
            "sort_order",
            "sort_order must be an integer",
        )

        resp = self._patch(url, {"label": None, "sort_order": 3})

        self.assertEqual(resp.status_code, 200, resp.data)
        link.refresh_from_db()
        self.assertEqual((link.label, link.sort_order), ("", 3))

    def test_subject_reorder_requires_a_list_of_ids(self):
        subject = Subject.objects.create(name="Sujet reorder", slug="sujet-reorder")
        url = f"/api/v1/content/subjects/{subject.slug}/cards/reorder/"

        self.assertFieldError(self._post(url, {"order": 3}), "order", "order must be a list of card IDs")
        self.assertFieldError(self._post(url, {}), "order", "order must be a list of card IDs")

    # --- Back-office des packs -----------------------------------------------

    def test_admin_pack_create_validates_status_and_cover(self):
        url = "/api/v1/content/admin/packs/"

        self.assertFieldError(
            self._post(url, {"name": "Pack", "status": "brouillon"}), "status", "invalid status"
        )
        # Un id d'image inconnu partait en IntegrityError (500) avant le serializer.
        self.assertFieldError(
            self._post(url, {"name": "Pack", "cover_image_id": 999999}),
            "cover_image_id",
            "Unknown image",
        )

        resp = self._post(url, {"name": "Pack", "estimated_minutes": "", "cover_image_id": ""})

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIsNone(resp.data["estimated_minutes"])
        self.assertIsNone(resp.data["cover_image"])
        self.assertEqual(resp.data["status"], Deck.Status.DRAFT)

    def test_admin_pack_patch_updates_only_the_submitted_fields(self):
        pack = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            name="Pack meta",
            description="Description initiale",
            status=Deck.Status.DRAFT,
            sort_order=0,
        )
        url = f"/api/v1/content/admin/packs/{pack.id}/"

        self.assertFieldError(self._patch(url, {}), "detail", "No fields to update")
        self.assertFieldError(self._patch(url, {"name": " "}), "name", "name must be a non-empty string")

        resp = self._patch(url, {"status": Deck.Status.PUBLISHED, "estimated_minutes": None})

        self.assertEqual(resp.status_code, 200, resp.data)
        pack.refresh_from_db()
        self.assertEqual(pack.status, Deck.Status.PUBLISHED)
        self.assertIsNone(pack.estimated_minutes)
        self.assertEqual(pack.description, "Description initiale")

    def test_admin_pack_bulk_add_requires_one_of_the_three_shapes(self):
        pack = Deck.objects.create(type=Deck.DeckType.OFFICIAL, name="Pack bulk", sort_order=0)
        url = f"/api/v1/content/admin/packs/{pack.id}/bulk-add/"

        self.assertFieldError(
            self._post(url, {"autre": []}),
            "detail",
            "Provide items (string) or microarticle_ids/slugs (list)",
        )

        resp = self._post(url, {"slugs": [self.card.slug, "inconnu"]})

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data["added"], resp.data["not_found"]), (1, 1))

    def test_admin_pack_reorder_requires_a_list(self):
        pack = Deck.objects.create(type=Deck.DeckType.OFFICIAL, name="Pack ordre", sort_order=0)
        url = f"/api/v1/content/admin/packs/{pack.id}/cards/reorder/"

        self.assertFieldError(
            self._post(url, {"microarticle_ids": 4}),
            "microarticle_ids",
            "microarticle_ids must be a list",
        )
        self.assertFieldError(
            self._post(url, {"microarticle_ids": ["abc"]}),
            "microarticle_ids",
            "microarticle_ids must be a list of integers",
        )

    def test_image_upload_reports_a_missing_file_under_the_file_key(self):
        resp = self.client.post(
            "/api/v1/content/admin/images/upload/", {}, format="multipart", secure=True
        )
        self.assertFieldError(resp, "file", "file is required")
