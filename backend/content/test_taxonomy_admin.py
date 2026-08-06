"""Création de catégories depuis le back-office (arbre treebeard)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import CategoryMaladies, CategoryTheme


def _url(taxonomy: str) -> str:
    return f"/api/v1/content/admin/taxonomies/{taxonomy}/nodes/"


class AdminTaxonomyNodeCreateTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.staff = get_user_model().objects.create_user(
            username="taxo-staff",
            email="taxo-staff@example.com",
            password="pharmapocket-test-pwd",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.staff)

    def test_creates_a_root_node_with_derived_slug(self):
        resp = self.client.post(_url("maladies"), {"name": "Insuffisance rénale"}, format="json", secure=True)

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["slug"], "insuffisance-renale")
        self.assertEqual(resp.data["depth"], 1)
        self.assertIsNone(resp.data["parent_id"])
        self.assertTrue(CategoryMaladies.objects.get(id=resp.data["id"]).is_root())

    def test_creates_a_child_node_under_the_given_parent(self):
        parent = CategoryTheme.add_root(name="Dispensation")

        resp = self.client.post(
            _url("theme"),
            {"name": "Ordonnance", "parent_id": parent.id},
            format="json",
            secure=True,
        )

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["parent_id"], parent.id)
        self.assertEqual(resp.data["depth"], 2)
        self.assertEqual(CategoryTheme.objects.get(id=resp.data["id"]).get_parent(), parent)

    def test_duplicate_name_is_rejected(self):
        CategoryTheme.add_root(name="Dispensation")

        resp = self.client.post(_url("theme"), {"name": "dispensation"}, format="json", secure=True)

        self.assertEqual(resp.status_code, 400)
        self.assertIn("name", resp.data)
        self.assertEqual(CategoryTheme.objects.count(), 1)

    def test_unknown_parent_is_rejected(self):
        resp = self.client.post(
            _url("theme"),
            {"name": "Ordonnance", "parent_id": 999999},
            format="json",
            secure=True,
        )

        self.assertEqual(resp.status_code, 400)
        self.assertIn("parent_id", resp.data)
        self.assertEqual(CategoryTheme.objects.count(), 0)

    def test_unknown_taxonomy_is_rejected(self):
        resp = self.client.post(_url("posologie"), {"name": "Ordonnance"}, format="json", secure=True)

        self.assertEqual(resp.status_code, 400)

    def test_requires_staff(self):
        self.client.force_authenticate(
            user=get_user_model().objects.create_user(
                username="taxo-member",
                email="taxo-member@example.com",
                password="pharmapocket-test-pwd",
            )
        )

        resp = self.client.post(_url("theme"), {"name": "Ordonnance"}, format="json", secure=True)

        self.assertEqual(resp.status_code, 403)
        self.assertEqual(CategoryTheme.objects.count(), 0)
