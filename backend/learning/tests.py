from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from wagtail.models import Page, Site

from content.models import Deck, DeckCard, MicroArticleIndexPage, MicroArticlePage


class SrsApiTests(APITestCase):
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
            ],
            takeaway="Médicament de première intention.",
        )
        index.add_child(instance=page)
        page.save_revision().publish()

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="u1", email="u1@example.com", password="pw")
        self.client.force_login(self.user)

        self.card = MicroArticlePage.objects.filter(slug="metformine").first()
        assert self.card is not None

        self.deck = Deck.objects.create(user=self.user, name="Test", is_default=True, sort_order=0)
        DeckCard.objects.get_or_create(deck=self.deck, microarticle_id=self.card.id)

    def test_srs_next_returns_unseen_due_card(self):
        resp = self.client.get(f"/api/v1/learning/srs/next/?scope=deck&deck_id={self.deck.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data.get("card"))
        self.assertEqual(resp.data["card"]["id"], self.card.id)
        self.assertEqual(resp.data["srs"]["level"], 1)

    def test_srs_review_updates_state(self):
        resp = self.client.post(
            "/api/v1/learning/srs/review/",
            {"card_id": self.card.id, "rating": "know"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["card"]["id"], self.card.id)
        self.assertEqual(resp.data["srs"]["level"], 2)

        due_at = resp.data["srs"]["due_at"]
        self.assertTrue(due_at)

        resp2 = self.client.get(
            f"/api/v1/learning/srs/next/?scope=deck&deck_id={self.deck.id}&only_due=true"
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertIsNone(resp2.data.get("card"))

        from learning.models import CardSRSState

        CardSRSState.objects.filter(user=self.user, microarticle_id=self.card.id).update(
            due_at=timezone.now() - timedelta(days=1)
        )

        resp3 = self.client.get(f"/api/v1/learning/srs/next/?scope=deck&deck_id={self.deck.id}")
        self.assertEqual(resp3.status_code, 200)
        self.assertIsNotNone(resp3.data.get("card"))
