from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set"})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_model = get_user_model()
        user = user_model.objects.filter(id=request.user.id).first()
        if user is None:
            return Response({"detail": "Not authenticated"}, status=401)

        return Response(
            {
                "id": user.id,
                "email": user.email,
                "username": user.get_username(),
                "pseudo": getattr(user, "pseudo", "") or "",
                "has_usable_password": bool(user.has_usable_password()),
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "landing_redirect_enabled": bool(getattr(user, "landing_redirect_enabled", False)),
                "landing_redirect_target": getattr(user, "landing_redirect_target", "start"),
            }
        )


class AccountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "email": user.email,
                "username": user.get_username(),
                "pseudo": getattr(user, "pseudo", "") or "",
                "has_usable_password": bool(user.has_usable_password()),
            }
        )

    def patch(self, request):
        user = request.user
        payload = request.data if isinstance(request.data, dict) else {}

        if "pseudo" not in payload:
            return Response({"detail": "No fields to update"}, status=400)

        pseudo = payload.get("pseudo")
        if pseudo is None:
            pseudo = ""
        if not isinstance(pseudo, str):
            return Response({"pseudo": "Must be a string"}, status=400)
        pseudo = pseudo.strip()
        if len(pseudo) > 60:
            return Response({"pseudo": "Max 60 characters"}, status=400)

        user.pseudo = pseudo
        user.save(update_fields=["pseudo"])

        return Response(
            {
                "email": user.email,
                "username": user.get_username(),
                "pseudo": getattr(user, "pseudo", "") or "",
                "has_usable_password": bool(user.has_usable_password()),
            }
        )


class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        payload = request.data if isinstance(request.data, dict) else {}

        password = payload.get("password")
        if password is None:
            password = ""
        if not isinstance(password, str):
            return Response({"password": "Must be a string"}, status=400)

        if user.has_usable_password():
            if not user.check_password(password):
                return Response({"password": "Incorrect password"}, status=400)

        with transaction.atomic():
            user.delete()

        return Response(status=204)


class PreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "landing_redirect_enabled": bool(getattr(user, "landing_redirect_enabled", False)),
                "landing_redirect_target": getattr(user, "landing_redirect_target", "start"),
            }
        )

    def patch(self, request):
        user = request.user
        payload = request.data if isinstance(request.data, dict) else {}

        update_fields = []

        if "landing_redirect_enabled" in payload:
            enabled = payload.get("landing_redirect_enabled")
            if not isinstance(enabled, bool):
                return Response({"landing_redirect_enabled": "Must be a boolean"}, status=400)
            user.landing_redirect_enabled = enabled
            update_fields.append("landing_redirect_enabled")

        if "landing_redirect_target" in payload:
            target = payload.get("landing_redirect_target")
            allowed = {"start", "discover", "cards", "review", "quiz"}
            if not isinstance(target, str) or target not in allowed:
                return Response(
                    {"landing_redirect_target": f"Must be one of: {', '.join(sorted(allowed))}"},
                    status=400,
                )
            user.landing_redirect_target = target
            update_fields.append("landing_redirect_target")

        if not update_fields:
            return Response({"detail": "No fields to update"}, status=400)

        user.save(update_fields=update_fields)

        return Response(
            {
                "landing_redirect_enabled": bool(user.landing_redirect_enabled),
                "landing_redirect_target": user.landing_redirect_target,
            }
        )
