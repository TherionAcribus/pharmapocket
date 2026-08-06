"""Overrides de vignettes par pathologie : lecture publique et CRUD staff."""

from django.utils.text import slugify
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import PathologyThumbOverride
from .helpers import _require_staff


def _is_hex_color(value: str) -> bool:
    if not isinstance(value, str):
        return False
    s = value.strip()
    if not s.startswith("#"):
        return False
    hex_part = s[1:]
    if len(hex_part) not in (3, 6, 8):
        return False
    try:
        int(hex_part, 16)
    except ValueError:
        return False
    return True


def _thumb_override_payload(obj: PathologyThumbOverride) -> dict:
    return {
        "id": obj.id,
        "pathology_slug": obj.pathology_slug,
        "bg": obj.bg,
        "accent": obj.accent,
        "pattern": obj.pattern,
        "updated_at": obj.updated_at,
    }


class ThumbOverridesPublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        rows = PathologyThumbOverride.objects.all().order_by("pathology_slug", "id")
        items = [
            {
                "pathology_slug": r.pathology_slug,
                "bg": r.bg,
                "accent": r.accent,
                "pattern": r.pattern,
            }
            for r in rows
        ]
        return Response(items)


class AdminThumbOverrideListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied
        rows = PathologyThumbOverride.objects.all().order_by("pathology_slug", "id")
        return Response([_thumb_override_payload(r) for r in rows])

    def post(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        payload = request.data if isinstance(request.data, dict) else {}
        pathology_slug = payload.get("pathology_slug")
        bg = payload.get("bg")
        accent = payload.get("accent")
        pattern = payload.get("pattern")

        if not isinstance(pathology_slug, str) or not pathology_slug.strip():
            raise DRFValidationError({"pathology_slug": "pathology_slug is required"})
        pathology_slug = slugify(pathology_slug.strip())
        if not pathology_slug:
            raise DRFValidationError({"pathology_slug": "Invalid pathology_slug"})

        if not isinstance(bg, str) or not _is_hex_color(bg):
            raise DRFValidationError({"bg": "bg must be a hex color (ex: #6D5BD0)"})
        if not isinstance(accent, str) or not _is_hex_color(accent):
            raise DRFValidationError({"accent": "accent must be a hex color (ex: #D7D2FF)"})
        if not isinstance(pattern, str) or pattern not in PathologyThumbOverride.Pattern.values:
            raise DRFValidationError({"pattern": "invalid pattern"})

        existing = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if existing is not None:
            raise DRFValidationError({"pathology_slug": "pathology_slug already exists"})

        obj = PathologyThumbOverride.objects.create(
            pathology_slug=pathology_slug,
            bg=bg.strip(),
            accent=accent.strip(),
            pattern=pattern,
        )
        return Response(_thumb_override_payload(obj), status=201)


class AdminThumbOverrideDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pathology_slug: str):
        denied = _require_staff(request)
        if denied is not None:
            return denied
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)
        return Response(_thumb_override_payload(obj))

    def patch(self, request, pathology_slug: str):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        update_fields = ["updated_at"]

        if "pathology_slug" in payload:
            next_slug = payload.get("pathology_slug")
            if not isinstance(next_slug, str) or not next_slug.strip():
                raise DRFValidationError({"pathology_slug": "pathology_slug must be a non-empty string"})
            next_slug = slugify(next_slug.strip())
            if not next_slug:
                raise DRFValidationError({"pathology_slug": "Invalid pathology_slug"})
            if next_slug != obj.pathology_slug and PathologyThumbOverride.objects.filter(pathology_slug=next_slug).exists():
                raise DRFValidationError({"pathology_slug": "pathology_slug already exists"})
            obj.pathology_slug = next_slug
            update_fields.append("pathology_slug")

        if "bg" in payload:
            bg = payload.get("bg")
            if not isinstance(bg, str) or not _is_hex_color(bg):
                raise DRFValidationError({"bg": "bg must be a hex color (ex: #6D5BD0)"})
            obj.bg = bg.strip()
            update_fields.append("bg")

        if "accent" in payload:
            accent = payload.get("accent")
            if not isinstance(accent, str) or not _is_hex_color(accent):
                raise DRFValidationError({"accent": "accent must be a hex color (ex: #D7D2FF)"})
            obj.accent = accent.strip()
            update_fields.append("accent")

        if "pattern" in payload:
            pattern = payload.get("pattern")
            if not isinstance(pattern, str) or pattern not in PathologyThumbOverride.Pattern.values:
                raise DRFValidationError({"pattern": "invalid pattern"})
            obj.pattern = pattern
            update_fields.append("pattern")

        if len(update_fields) == 1:
            raise DRFValidationError({"detail": "No fields to update"})

        obj.save(update_fields=update_fields)
        return Response(_thumb_override_payload(obj))

    def delete(self, request, pathology_slug: str):
        denied = _require_staff(request)
        if denied is not None:
            return denied
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)
        obj.delete()
        return Response(status=204)
