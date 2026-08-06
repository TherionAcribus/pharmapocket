from __future__ import annotations

import shutil
import tempfile
from io import BytesIO

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
    CategoryMedicament,
    CategoryPharmacologie,
    Deck,
    DeckCard,
    PathologyThumbOverride,
    MicroArticleIndexPage,
    MicroArticlePage,
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
