from __future__ import annotations

import shutil
import tempfile
from io import BytesIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils.text import slugify
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


class PublicApiSmokeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        root = Page.get_first_root_node()

        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

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

    def test_content_detail_smoke(self):
        resp = self.client.get("/api/v1/content/microarticles/metformine/", secure=True)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["slug"], "metformine")
        self.assertIn("questions", resp.data)
        self.assertIn("published_at", resp.data)

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
