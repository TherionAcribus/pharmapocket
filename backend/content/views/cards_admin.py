"""Back-office des fiches : import d'un JSON éditorial généré par IA."""

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from ..importers import import_cards
from ..permissions import IsStaff
from ..serializers.inputs import AdminCardImportSerializer
from ..serializers.responses import AdminCardImportReportSerializer


class AdminCardImportView(APIView):
    """Crée des fiches à partir du JSON décrit dans `docs/prompt_generation_cartes.md`.

    L'import est tout-ou-rien : une seule carte en erreur annule le lot, et le
    rapport détaille carte par carte ce qu'il faut corriger. `dry_run` rejoue
    exactement le même chemin puis annule la transaction.
    """

    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="admin_card_import",
        request=AdminCardImportSerializer,
        responses={200: AdminCardImportReportSerializer, 400: AdminCardImportReportSerializer},
    )
    def post(self, request):
        serializer = AdminCardImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        report = import_cards(
            data["cards"],
            publish=data["publish"],
            dry_run=data["dry_run"],
            create_sources=data["create_sources"],
            on_existing=data["on_existing"],
            owner=request.user,
        )
        return Response(report, status=200 if report["ok"] else 400)
