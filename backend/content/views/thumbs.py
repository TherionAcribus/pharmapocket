"""Overrides de vignettes par pathologie : lecture publique et CRUD staff."""

from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import PathologyThumbOverride
from ..permissions import IsStaff
from ..serializers import AdminThumbOverrideSerializer, ThumbOverridePublicSerializer
from ..serializers.inputs import ThumbOverrideCreateSerializer, ThumbOverridePatchSerializer


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

    @extend_schema(
        operation_id="thumb_override_public_list",
        responses=ThumbOverridePublicSerializer(many=True),
    )
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
    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="admin_thumb_override_list",
        responses=AdminThumbOverrideSerializer(many=True),
    )
    def get(self, request):
        rows = PathologyThumbOverride.objects.all().order_by("pathology_slug", "id")
        return Response([_thumb_override_payload(r) for r in rows])

    @extend_schema(
        operation_id="admin_thumb_override_create",
        request=ThumbOverrideCreateSerializer,
        responses={201: AdminThumbOverrideSerializer},
    )
    def post(self, request):
        serializer = ThumbOverrideCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        obj = PathologyThumbOverride.objects.create(**serializer.validated_data)
        return Response(_thumb_override_payload(obj), status=201)


class AdminThumbOverrideDetailView(APIView):
    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="admin_thumb_override_retrieve",
        responses=AdminThumbOverrideSerializer,
    )
    def get(self, request, pathology_slug: str):
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)
        return Response(_thumb_override_payload(obj))

    @extend_schema(
        operation_id="admin_thumb_override_update",
        request=ThumbOverridePatchSerializer,
        responses=AdminThumbOverrideSerializer,
    )
    def patch(self, request, pathology_slug: str):
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)

        serializer = ThumbOverridePatchSerializer(data=request.data, context={"override": obj})
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(obj, field, value)
        obj.save(update_fields=[*serializer.validated_data, "updated_at"])
        return Response(_thumb_override_payload(obj))

    @extend_schema(operation_id="admin_thumb_override_delete", responses={204: None})
    def delete(self, request, pathology_slug: str):
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)
        obj.delete()
        return Response(status=204)
