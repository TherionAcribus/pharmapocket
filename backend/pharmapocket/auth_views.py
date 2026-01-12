from django.contrib.auth import get_user_model
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
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "landing_redirect_enabled": bool(getattr(user, "landing_redirect_enabled", False)),
                "landing_redirect_target": getattr(user, "landing_redirect_target", "start"),
            }
        )


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
