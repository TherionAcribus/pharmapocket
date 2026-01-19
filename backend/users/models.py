from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


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

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("pseudo"),
                name="uniq_user_pseudo_ci",
                condition=~Q(pseudo=""),
            )
        ]
