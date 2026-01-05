from __future__ import annotations

from datetime import datetime
from typing import Literal

from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from content.models import MicroArticlePage

from .models import LessonProgress
from .serializers import (
    LessonProgressSerializer,
    LessonProgressUpdateSerializer,
    ProgressImportSerializer,
)


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
