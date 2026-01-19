from django.contrib.auth import get_user_model
from django.contrib.auth.backends import BaseBackend


class PseudoAuthenticationBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or password is None:
            return None

        user_model = get_user_model()
        user = user_model.objects.filter(pseudo__iexact=str(username).strip()).first()
        if user is None:
            return None

        if not getattr(user, "is_active", True):
            return None

        if not user.check_password(password):
            return None

        return user

    def get_user(self, user_id):
        user_model = get_user_model()
        return user_model.objects.filter(pk=user_id).first()
