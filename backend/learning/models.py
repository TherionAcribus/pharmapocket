from django.conf import settings
from django.db import models

from content.models import MicroArticlePage


class LessonProgress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="lesson_progress",
    )
    lesson = models.ForeignKey(
        MicroArticlePage,
        on_delete=models.CASCADE,
        related_name="progress_records",
    )

    seen = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)
    percent = models.PositiveSmallIntegerField(default=0)
    time_ms = models.BigIntegerField(default=0)

    score_best = models.PositiveSmallIntegerField(null=True, blank=True)
    score_last = models.PositiveSmallIntegerField(null=True, blank=True)

    updated_at = models.DateTimeField()
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "lesson"], name="uniq_user_lesson_progress"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.lesson_id}"


class LearningEvent(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learning_events",
    )
    device_id = models.CharField(max_length=64, blank=True)
    type = models.CharField(max_length=64)
    lesson = models.ForeignKey(
        MicroArticlePage,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="learning_events",
    )
    payload = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.type
