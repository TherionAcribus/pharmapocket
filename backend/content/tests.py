from __future__ import annotations

from django.utils.text import slugify
from rest_framework.test import APITestCase
from taggit.models import Tag
from wagtail.models import Page, Site

from .models import (
    CategoryMedicament,
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
            title_question="Pourquoi la metformine est-elle en première intention ?",
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

        cat_root = CategoryMedicament.add_root(name="Diabète")
        cat_root.add_child(name="Biguanides")

    def test_content_list_smoke(self):
        resp = self.client.get("/api/v1/content/microarticles/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)
        self.assertIsInstance(resp.data["results"], list)
        self.assertTrue(resp.data["results"], "Expected at least one microarticle")

        first = resp.data["results"][0]
        self.assertIn("tags_payload", first)
        self.assertIn("published_at", first)

    def test_content_detail_smoke(self):
        resp = self.client.get("/api/v1/content/microarticles/metformine/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["slug"], "metformine")
        self.assertIn("questions", resp.data)
        self.assertIn("published_at", resp.data)

    def test_taxonomy_tree_smoke(self):
        resp = self.client.get("/api/v1/taxonomies/pharmacologie/tree/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["taxonomy"], "pharmacologie")
        self.assertIn("tree", resp.data)
        self.assertTrue(resp.data["tree"], "Expected non-empty taxonomy tree")

    def test_taxonomy_resolve_smoke(self):
        root_slug = slugify("Diabète")
        child_slug = slugify("Biguanides")
        resp = self.client.get(
            f"/api/v1/taxonomies/pharmacologie/resolve/?path={root_slug}/{child_slug}"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["taxonomy"], "pharmacologie")
        self.assertIn("node_id", resp.data)
        self.assertIn("breadcrumb", resp.data)
        self.assertIn("canonical_path", resp.data)

    def test_tags_list_smoke(self):
        resp = self.client.get("/api/v1/tags/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(any(t["slug"] == "diabete" for t in resp.data))

        resp2 = self.client.get("/api/v1/tags/?q=dia&limit=5")
        self.assertEqual(resp2.status_code, 200)
        self.assertLessEqual(len(resp2.data), 5)

    def test_content_list_tags_slug_only_validation(self):
        Tag.objects.get_or_create(name="not-slug", slug="not-slug")

        resp = self.client.get("/api/v1/content/microarticles/?tags=Not%20Slug")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("tags", resp.data)
        self.assertIn("invalid", resp.data)
