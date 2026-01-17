from __future__ import annotations

from collections import defaultdict

from django.db.models import Q
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from taggit.models import Tag

from .models import CategoryMaladies, CategoryMedicament, CategoryPharmacologie, CategoryTheme


def _taxonomy_model(taxonomy: str):
    if taxonomy in ("theme", "classes"):
        return CategoryTheme
    if taxonomy == "maladies":
        return CategoryMaladies
    if taxonomy == "medicament":
        return CategoryMedicament
    if taxonomy == "pharmacologie":
        return CategoryPharmacologie
    return None


class TaxonomyTreeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, taxonomy: str):
        model = _taxonomy_model(taxonomy)
        if model is None:
            return Response({"detail": "Unknown taxonomy."}, status=400)

        nodes = list(model.objects.all().order_by("path"))
        steplen = model.steplen

        path_to_id: dict[str, int] = {}
        by_id: dict[int, dict] = {}
        children: dict[int | None, list[dict]] = defaultdict(list)

        for n in nodes:
            parent_id = None
            if n.depth > 1:
                parent_path = n.path[:-steplen]
                parent_id = path_to_id.get(parent_path)

            path_to_id[n.path] = n.id

            item = {
                "id": n.id,
                "name": n.name,
                "slug": n.slug,
                "parent_id": parent_id,
                "children": [],
            }
            by_id[n.id] = item
            children[parent_id].append(item)

        for item in by_id.values():
            item["children"] = children.get(item["id"], [])

        return Response({"taxonomy": taxonomy, "tree": children.get(None, [])})


class TaxonomyResolveView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, taxonomy: str):
        model = _taxonomy_model(taxonomy)
        if model is None:
            return Response({"detail": "Unknown taxonomy."}, status=400)

        path = request.query_params.get("path")
        if not path:
            return Response({"detail": "path is required."}, status=400)

        parts = [p for p in path.split("/") if p]
        if not parts:
            return Response({"detail": "Invalid path."}, status=400)

        node = model.objects.filter(slug=parts[0], depth=1).first()
        if node is None:
            return Response({"detail": "Not found."}, status=404)

        for slug in parts[1:]:
            node = node.get_children().filter(slug=slug).first()
            if node is None:
                return Response({"detail": "Not found."}, status=404)

        ancestors = list(node.get_ancestors())
        breadcrumb_nodes = ancestors + [node]
        breadcrumb = [{"id": n.id, "name": n.name, "slug": n.slug} for n in breadcrumb_nodes]
        canonical_path = "/".join([n.slug for n in breadcrumb_nodes])

        return Response(
            {
                "taxonomy": taxonomy,
                "node_id": node.id,
                "breadcrumb": breadcrumb,
                "canonical_path": canonical_path,
            }
        )


class TagListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Tag.objects.all().order_by("name")

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q))

        limit_raw = request.query_params.get("limit")
        if limit_raw:
            try:
                limit = int(limit_raw)
            except ValueError:
                limit = 50
        else:
            limit = 200

        limit = max(1, min(limit, 500))
        qs = qs[:limit]

        return Response(
            [{"id": t.id, "name": t.name, "slug": t.slug} for t in qs]
        )
