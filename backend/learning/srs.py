from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from django.utils import timezone


Rating = Literal["know", "medium", "again"]


@dataclass(frozen=True)
class SRSUpdate:
    level: int
    due_at: datetime


LEITNER_INTERVAL_DAYS_BY_LEVEL: dict[int, int] = {
    1: 1,
    2: 3,
    3: 7,
    4: 14,
    5: 30,
}


def next_leitner_state(*, level: int, rating: Rating, now=None) -> SRSUpdate:
    if now is None:
        now = timezone.now()

    current = max(1, min(5, int(level)))

    if rating == "know":
        next_level = min(5, current + 1)
    elif rating == "again":
        next_level = max(1, current - 1)
    else:
        next_level = current

    interval_days = LEITNER_INTERVAL_DAYS_BY_LEVEL.get(next_level, 1)
    due_at = now + timedelta(days=int(interval_days))
    return SRSUpdate(level=next_level, due_at=due_at)
