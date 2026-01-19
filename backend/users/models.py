from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class HomeRedirectTarget(models.TextChoices):
        START = "start", "Commencer"
        DISCOVER = "discover", "Dose du jour"
        CARDS = "cards", "Mes cartes"
        REVIEW = "review", "Révision"
        QUIZ = "quiz", "Quiz"

    landing_redirect_enabled = models.BooleanField(default=False)
    landing_redirect_target = models.CharField(
        max_length=32,
        choices=HomeRedirectTarget.choices,
        default=HomeRedirectTarget.START,
    )

    pseudo = models.CharField(max_length=60, blank=True, default="")
