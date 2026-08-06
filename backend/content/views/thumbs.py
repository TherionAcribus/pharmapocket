"""Overrides de vignettes par pathologie : lecture publique et CRUD staff."""

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import PathologyThumbOverride
from ..serializers.inputs import ThumbOverrideCreateSerializer, ThumbOverridePatchSerializer
from .helpers import _require_staff


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

        serializer = ThumbOverrideCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        obj = PathologyThumbOverride.objects.create(**serializer.validated_data)
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

        serializer = ThumbOverridePatchSerializer(data=request.data, context={"override": obj})
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(obj, field, value)
        obj.save(update_fields=[*serializer.validated_data, "updated_at"])
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
