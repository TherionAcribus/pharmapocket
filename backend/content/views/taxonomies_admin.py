"""Back-office des taxonomies : création d'un nœud de catégorie.

Complète l'import de fiches : quand le LLM propose une catégorie qui n'existe
pas encore, le rapport la remonte et le back-office la crée ici, au bon endroit
de l'arbre, avant de relancer l'import.
"""

from django.db import IntegrityError
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsStaff
from ..public_views import _taxonomy_model
from ..serializers.inputs import AdminTaxonomyNodeCreateSerializer
from ..serializers.responses import AdminTaxonomyNodeSerializer


def _node_payload(node, taxonomy: str) -> dict:
    parent = node.get_parent()
    return {
        "id": node.id,
        "name": node.name,
        "slug": node.slug,
        "depth": node.depth,
        "parent_id": parent.id if parent else None,
        "taxonomy": taxonomy,
    }


class AdminTaxonomyNodeCreateView(APIView):
    """POST /admin/taxonomies/<taxonomy>/nodes/ — crée une catégorie.

    Treebeard exige `add_root()` / `parent.add_child()` pour allouer le chemin :
    c'est la seule façon de créer un nœud, `save()` direct est refusé par le modèle.
    """

    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="admin_taxonomy_node_create",
        request=AdminTaxonomyNodeCreateSerializer,
        responses={201: AdminTaxonomyNodeSerializer},
    )
    def post(self, request, taxonomy: str):
        model = _taxonomy_model(taxonomy)
        if model is None:
            return Response({"detail": "Unknown taxonomy."}, status=400)

        serializer = AdminTaxonomyNodeCreateSerializer(
            data=request.data, context={"model": model}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        parent = data.get("parent")
        try:
            if parent is None:
                node = model.add_root(name=data["name"], slug=data["slug"])
            else:
                node = parent.add_child(name=data["name"], slug=data["slug"])
        except IntegrityError:
            # `name` et `slug` sont uniques : une création concurrente ou une
            # casse différente peut passer la validation du serializer.
            return Response({"detail": "Cette catégorie existe déjà."}, status=400)

        return Response(_node_payload(node, taxonomy), status=201)
