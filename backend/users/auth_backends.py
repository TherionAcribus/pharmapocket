from django.contrib.auth import get_user_model
from django.contrib.auth.backends import BaseBackend


class PseudoAuthenticationBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or password is None:
            return None

        user_model = get_user_model()
        user = user_model.objects.filter(pseudo__iexact=str(username).strip()).first()
        if user is None:
            # Exécute quand même le hachage du mot de passe pour que le temps de
            # réponse soit le même qu'avec un pseudo existant (cf. ModelBackend),
            # afin d'éviter l'énumération d'utilisateurs par mesure de timing.
            user_model().set_password(password)
            return None

        # Le mot de passe est vérifié avant le statut du compte, sinon un compte
        # inactif répondrait plus vite qu'un compte actif.
        password_valid = user.check_password(password)
        if not password_valid:
            return None

        if not getattr(user, "is_active", True):
            return None

        return user

    def get_user(self, user_id):
        user_model = get_user_model()
        return user_model.objects.filter(pk=user_id).first()
