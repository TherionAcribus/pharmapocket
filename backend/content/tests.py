from __future__ import annotations

from django.utils.text import slugify
from rest_framework.test import APITestCase
from taggit.models import Tag
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
