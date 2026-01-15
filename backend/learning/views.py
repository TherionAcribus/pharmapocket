from __future__ import annotations

from datetime import datetime
from typing import Literal

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError as DRFValidationError

from content.models import Deck, DeckCard, MicroArticlePage

from .models import CardSRSState, LessonProgress
from .serializers import (
    LessonProgressSerializer,
    LessonProgressUpdateSerializer,
    ProgressImportSerializer,
    SRSNextSerializer,
    SRSReviewSerializer,
)

from .srs import next_leitner_state


def _merge_progress(
    *,
    existing: LessonProgress | None,
    incoming: dict,
    time_merge: Literal["max", "sum"],
) -> LessonProgress:
    incoming_updated_at: datetime = incoming["updated_at"]

    if existing is None:
        return LessonProgress(
            seen=incoming.get("seen", False),
            completed=incoming.get("completed", False),
            percent=incoming.get("percent", 0),
            time_ms=incoming.get("time_ms", 0),
            score_best=incoming.get("score_best"),
            score_last=incoming.get("score_last"),
            updated_at=incoming_updated_at,
            last_seen_at=incoming.get("last_seen_at"),
        )

    if incoming_updated_at > existing.updated_at:
        existing.seen = incoming.get("seen", existing.seen)
        existing.completed = incoming.get("completed", existing.completed)
        existing.percent = incoming.get("percent", existing.percent)
        existing.score_last = incoming.get("score_last", existing.score_last)
        existing.last_seen_at = incoming.get("last_seen_at", existing.last_seen_at)

    incoming_time_ms = incoming.get("time_ms")
    if incoming_time_ms is not None:
        if time_merge == "sum":
            existing.time_ms = existing.time_ms + incoming_time_ms
        else:
            existing.time_ms = max(existing.time_ms, incoming_time_ms)

    incoming_score_best = incoming.get("score_best")
    if incoming_score_best is not None:
        existing.score_best = (
            incoming_score_best
            if existing.score_best is None
            else max(existing.score_best, incoming_score_best)
        )

    existing.updated_at = max(existing.updated_at, incoming_updated_at)
    return existing


class ProgressListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            LessonProgress.objects.filter(user=request.user)
            .select_related("lesson")
            .order_by("lesson_id")
        )
        data = [
            {
                "lesson_id": r.lesson_id,
                "seen": r.seen,
                "completed": r.completed,
                "percent": r.percent,
                "time_ms": r.time_ms,
                "score_best": r.score_best,
                "score_last": r.score_last,
                "updated_at": r.updated_at,
                "last_seen_at": r.last_seen_at,
            }
            for r in rows
        ]
        serializer = LessonProgressSerializer(data, many=True)
        return Response(serializer.data)


class ProgressUpsertView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, lesson_id: int):
        serializer = LessonProgressUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lesson = MicroArticlePage.objects.filter(id=lesson_id).specific().first()
        if lesson is None:
            return Response({"detail": "Lesson not found."}, status=404)

        payload = serializer.validated_data

        with transaction.atomic():
            existing = LessonProgress.objects.select_for_update().filter(
                user=request.user, lesson_id=lesson_id
            ).first()

            merged = _merge_progress(existing=existing, incoming=payload, time_merge="max")
            merged.user = request.user
            merged.lesson = lesson
            merged.save()

        return Response(
            {
                "lesson_id": merged.lesson_id,
                "seen": merged.seen,
                "completed": merged.completed,
                "percent": merged.percent,
                "time_ms": merged.time_ms,
                "score_best": merged.score_best,
                "score_last": merged.score_last,
                "updated_at": merged.updated_at,
                "last_seen_at": merged.last_seen_at,
            }
        )


class ProgressImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ProgressImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lessons: dict[str, dict] = serializer.validated_data["lessons"]

        imported = 0
        updated = 0

        with transaction.atomic():
            for lesson_id_str, incoming in lessons.items():
                try:
                    lesson_id = int(lesson_id_str)
                except ValueError:
                    continue

                lesson = MicroArticlePage.objects.filter(id=lesson_id).specific().first()
                if lesson is None:
                    continue

                existing = LessonProgress.objects.select_for_update().filter(
                    user=request.user, lesson_id=lesson_id
                ).first()

                before_updated_at = existing.updated_at if existing else None
                merged = _merge_progress(existing=existing, incoming=incoming, time_merge="sum")
                merged.user = request.user
                merged.lesson = lesson
                merged.save()

                imported += 1
                if before_updated_at is None or merged.updated_at > before_updated_at:
                    updated += 1

        return Response({"imported": imported, "updated": updated})


def _parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _parse_int_list(value: str | None) -> list[int]:
    if not value or not isinstance(value, str):
        return []
    out: list[int] = []
    for part in value.split(","):
        p = part.strip()
        if not p:
            continue
        try:
            out.append(int(p))
        except ValueError:
            continue
    return out


def _parse_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    v = value.strip().lower()
    if v in {"1", "true", "yes", "y", "on"}:
        return True
    if v in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _cover_url(page: MicroArticlePage) -> str | None:
    if not page.cover_image_id:
        return None
    try:
        return page.cover_image.file.url
    except Exception:
        return None


def _cover_credit(page: MicroArticlePage) -> str | None:
    if not page.cover_image_id:
        return None
    try:
        text = getattr(page.cover_image, "credit_text", None)
        if callable(text):
            value = text()
        else:
            value = str(text) if text else ""
        return value or None
    except Exception:
        return None


def _key_points(page: MicroArticlePage) -> list[str]:
    return [block.value for block in page.key_points]


def _card_payload(page: MicroArticlePage) -> dict:
    return {
        "id": page.id,
        "slug": page.slug,
        "title": page.title,
        "answer_express": page.answer_express,
        "takeaway": page.takeaway,
        "key_points": _key_points(page),
        "cover_image_url": _cover_url(page),
        "cover_image_credit": _cover_credit(page),
    }


class SRSNextView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = request.query_params.get("scope")
        deck_id = _parse_int(request.query_params.get("deck_id"))
        deck_ids = _parse_int_list(request.query_params.get("deck_ids"))
        only_due = _parse_bool(request.query_params.get("only_due"), default=True)

        if not scope:
            scope = "all_decks"

        candidates = MicroArticlePage.objects.none()

        if scope == "all_cards":
            candidates = MicroArticlePage.objects.live().public().select_related("cover_image")
        else:
            decks_qs = Deck.objects.filter(user=request.user, type=Deck.DeckType.USER)
            if scope == "deck":
                if deck_id is None:
                    raise DRFValidationError({"deck_id": "deck_id is required when scope=deck"})
                decks_qs = decks_qs.filter(id=deck_id)
            elif scope == "decks":
                if not deck_ids:
                    raise DRFValidationError({"deck_ids": "deck_ids is required when scope=decks"})
                decks_qs = decks_qs.filter(id__in=deck_ids)
            elif scope != "all_decks":
                raise DRFValidationError({"scope": "scope must be one of: all_decks, deck, decks, all_cards"})

            card_ids_qs = (
                DeckCard.objects.filter(deck__in=decks_qs)
                .values_list("microarticle_id", flat=True)
                .distinct()
            )
            candidates = (
                MicroArticlePage.objects.live()
                .public()
                .filter(id__in=card_ids_qs)
                .select_related("cover_image")
            )

        candidate_ids_qs = candidates.values_list("id", flat=True)
        now = timezone.now()

        due_state = (
            CardSRSState.objects.filter(
                user=request.user,
                microarticle_id__in=candidate_ids_qs,
                due_at__lte=now,
            )
            .select_related("microarticle", "microarticle__cover_image")
            .order_by("due_at", "id")
            .first()
        )

        if due_state is not None:
            payload = {
                "card": _card_payload(due_state.microarticle),
                "srs": {
                    "level": due_state.srs_level,
                    "due_at": due_state.due_at,
                    "last_reviewed_at": due_state.last_reviewed_at,
                    "reviews_count": due_state.reviews_count,
                    "last_rating": due_state.last_rating,
                },
            }
            serializer = SRSNextSerializer(payload)
            return Response(serializer.data)

        unseen = (
            candidates.exclude(srs_states__user=request.user)
            .order_by("id")
            .first()
        )
        if unseen is not None:
            payload = {
                "card": _card_payload(unseen),
                "srs": {
                    "level": 1,
                    "due_at": now,
                    "last_reviewed_at": None,
                    "reviews_count": 0,
                    "last_rating": "",
                },
            }
            serializer = SRSNextSerializer(payload)
            return Response(serializer.data)

        if only_due:
            serializer = SRSNextSerializer({"card": None, "srs": None})
            return Response(serializer.data)

        next_state = (
            CardSRSState.objects.filter(
                user=request.user,
                microarticle_id__in=candidate_ids_qs,
            )
            .select_related("microarticle", "microarticle__cover_image")
            .order_by("due_at", "id")
            .first()
        )
        if next_state is None:
            serializer = SRSNextSerializer({"card": None, "srs": None})
            return Response(serializer.data)

        payload = {
            "card": _card_payload(next_state.microarticle),
            "srs": {
                "level": next_state.srs_level,
                "due_at": next_state.due_at,
                "last_reviewed_at": next_state.last_reviewed_at,
                "reviews_count": next_state.reviews_count,
                "last_rating": next_state.last_rating,
            },
        }
        serializer = SRSNextSerializer(payload)
        return Response(serializer.data)


class SRSReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SRSReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        card_id: int = serializer.validated_data["card_id"]
        rating: str = serializer.validated_data["rating"]

        page = MicroArticlePage.objects.filter(id=card_id).select_related("cover_image").first()
        if page is None:
            return Response({"detail": "Card not found."}, status=404)

        now = timezone.now()

        with transaction.atomic():
            state = (
                CardSRSState.objects.select_for_update()
                .filter(user=request.user, microarticle_id=card_id)
                .first()
            )
            if state is None:
                state = CardSRSState(
                    user=request.user,
                    microarticle_id=card_id,
                    srs_level=1,
                    due_at=now,
                )

            update = next_leitner_state(level=state.srs_level, rating=rating, now=now)
            state.srs_level = update.level
            state.due_at = update.due_at
            state.last_reviewed_at = now
            state.reviews_count = int(state.reviews_count or 0) + 1
            state.last_rating = rating
            state.save()

        payload = {
            "card": _card_payload(page),
            "srs": {
                "level": state.srs_level,
                "due_at": state.due_at,
                "last_reviewed_at": state.last_reviewed_at,
                "reviews_count": state.reviews_count,
                "last_rating": state.last_rating,
            },
        }
        out = SRSNextSerializer(payload)
        return Response(out.data)
