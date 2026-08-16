from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from wagtail.models import Page, Site

from content.models import Deck, DeckCard, MicroArticleIndexPage, MicroArticlePage
from content.serializers import MicroArticleCardSerializer
from learning.models import LessonProgress


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
        resp = self.client.get(
            f"/api/v1/learning/srs/next/?scope=deck&deck_id={self.deck.id}",
            secure=True,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data.get("card"))
        self.assertEqual(resp.data["card"]["id"], self.card.id)
        self.assertEqual(resp.data["card"], MicroArticleCardSerializer(self.card).data)
        self.assertEqual(resp.data["srs"]["level"], 1)

    def test_srs_review_updates_state(self):
        resp = self.client.post(
            "/api/v1/learning/srs/review/",
            {"card_id": self.card.id, "rating": "know"},
            format="json",
            secure=True,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["card"]["id"], self.card.id)
        self.assertEqual(resp.data["srs"]["level"], 2)

        due_at = resp.data["srs"]["due_at"]
        self.assertTrue(due_at)

        resp2 = self.client.get(
            f"/api/v1/learning/srs/next/?scope=deck&deck_id={self.deck.id}&only_due=true",
            secure=True,
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertIsNone(resp2.data.get("card"))

        from learning.models import CardSRSState

        CardSRSState.objects.filter(user=self.user, microarticle_id=self.card.id).update(
            due_at=timezone.now() - timedelta(days=1)
        )

        resp3 = self.client.get(
            f"/api/v1/learning/srs/next/?scope=deck&deck_id={self.deck.id}",
            secure=True,
        )
        self.assertEqual(resp3.status_code, 200)
        self.assertIsNotNone(resp3.data.get("card"))

    def _import_progress(self, *, time_ms: int, updated_at):
        return self.client.post(
            "/api/v1/learning/progress/import/",
            {
                "device_id": "dev-1",
                "lessons": {
                    str(self.card.id): {
                        "seen": True,
                        "time_ms": time_ms,
                        "updated_at": updated_at.isoformat(),
                    }
                },
            },
            format="json",
            secure=True,
        )

    def _server_time_ms(self) -> int:
        resp = self.client.get("/api/v1/learning/progress/", secure=True)
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.data if r["lesson_id"] == self.card.id)
        return row["time_ms"]

    def test_import_does_not_double_count_cumulative_time(self):
        """Le client envoie un time_ms cumule : les imports successifs ne doivent pas s additionner."""
        now = timezone.now()

        self.assertEqual(self._import_progress(time_ms=60_000, updated_at=now).status_code, 200)
        self.assertEqual(self._server_time_ms(), 60_000)

        # Nouvelle session de 30s : le client renvoie le total cumule, pas le delta.
        resp = self._import_progress(time_ms=90_000, updated_at=now + timedelta(minutes=1))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._server_time_ms(), 90_000)

    def test_import_is_idempotent_on_time_ms(self):
        now = timezone.now()
        self._import_progress(time_ms=60_000, updated_at=now)
        self._import_progress(time_ms=60_000, updated_at=now)
        self.assertEqual(self._server_time_ms(), 60_000)

    def test_import_keeps_highest_time_ms_when_a_device_lags(self):
        now = timezone.now()
        self._import_progress(time_ms=90_000, updated_at=now)
        # Un appareil en retard renvoie un total plus ancien : on ne regresse pas.
        self._import_progress(time_ms=60_000, updated_at=now + timedelta(minutes=1))
        self.assertEqual(self._server_time_ms(), 90_000)

    def _patch_progress(self, *, updated_at, **fields):
        return self.client.patch(
            f"/api/v1/learning/progress/{self.card.id}/",
            {**fields, "updated_at": updated_at.isoformat()},
            format="json",
            secure=True,
        )

    def test_future_client_clock_is_capped_to_server_now(self):
        before = timezone.now()
        resp = self._patch_progress(seen=True, updated_at=before + timedelta(hours=1))
        self.assertEqual(resp.status_code, 200)

        stored = LessonProgress.objects.get(user=self.user, lesson_id=self.card.id)
        self.assertGreaterEqual(stored.updated_at, before)
        self.assertLessEqual(stored.updated_at, timezone.now())

    def test_future_client_clock_does_not_freeze_later_writes(self):
        now = timezone.now()

        # Appareil dont l horloge avance d une heure.
        self._patch_progress(percent=10, completed=False, updated_at=now + timedelta(hours=1))
        # Appareil a l heure, qui ecrit apres : il doit gagner malgre l horodatage
        # nominalement plus ancien.
        resp = self._patch_progress(percent=100, completed=True, updated_at=now + timedelta(seconds=1))

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["percent"], 100)
        self.assertTrue(resp.data["completed"])

    def test_row_already_poisoned_by_a_future_timestamp_is_repaired(self):
        now = timezone.now()
        LessonProgress.objects.create(
            user=self.user,
            lesson_id=self.card.id,
            seen=True,
            percent=10,
            updated_at=now + timedelta(days=2),
        )

        resp = self._patch_progress(percent=100, completed=True, updated_at=now)
        self.assertEqual(resp.status_code, 200)

        stored = LessonProgress.objects.get(user=self.user, lesson_id=self.card.id)
        self.assertLessEqual(stored.updated_at, timezone.now())

        # La ligne n est plus gelee : l ecriture suivante passe.
        resp2 = self._patch_progress(percent=100, completed=True, updated_at=timezone.now())
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data["percent"], 100)
        self.assertTrue(resp2.data["completed"])

    def test_future_last_seen_at_is_capped_too(self):
        now = timezone.now()
        resp = self._patch_progress(
            seen=True,
            last_seen_at=(now + timedelta(hours=1)).isoformat(),
            updated_at=now,
        )
        self.assertEqual(resp.status_code, 200)

        stored = LessonProgress.objects.get(user=self.user, lesson_id=self.card.id)
        self.assertLessEqual(stored.last_seen_at, timezone.now())

    def test_unpublished_card_cannot_be_reviewed_or_receive_progress(self):
        index = MicroArticleIndexPage.objects.first()
        assert index is not None
        draft = MicroArticlePage(
            title="Brouillon interne",
            slug="brouillon-interne",
            live=False,
        )
        index.add_child(instance=draft)

        review = self.client.post(
            "/api/v1/learning/srs/review/",
            {"card_id": draft.id, "rating": "know"},
            format="json",
            secure=True,
        )
        self.assertEqual(review.status_code, 404)

        progress = self.client.patch(
            f"/api/v1/learning/progress/{draft.id}/",
            {"seen": True, "updated_at": timezone.now().isoformat()},
            format="json",
            secure=True,
        )
        self.assertEqual(progress.status_code, 404)
