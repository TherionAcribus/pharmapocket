from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from allauth.account.adapter import DefaultAccountAdapter


class AccountAdapter(DefaultAccountAdapter):
    def clean_username(self, username, *args, **kwargs):
        username = super().clean_username(username, *args, **kwargs)
        username = (username or "").strip()

        if not username:
            raise ValidationError("Ce pseudo est requis.")

        if len(username) > 60:
            raise ValidationError("Le pseudo doit faire 60 caractères maximum.")

        if "@" in username:
            raise ValidationError("Le pseudo ne doit pas contenir '@'.")

        user_model = get_user_model()
        if user_model.objects.filter(username__iexact=username).exists():
            raise ValidationError("Ce pseudo est déjà utilisé.")

        if user_model.objects.filter(pseudo__iexact=username).exists():
            raise ValidationError("Ce pseudo est déjà utilisé.")

        return username

    def save_user(self, request, user, form, commit=True):
        user = super().save_user(request, user, form, commit=commit)

        # Keep our dedicated pseudo field in sync with the username used at signup.
        pseudo = (getattr(user, "username", "") or "").strip()
        if pseudo and not (getattr(user, "pseudo", "") or "").strip():
            user.pseudo = pseudo
            if commit:
                user.save(update_fields=["pseudo"])

        return user
