from __future__ import annotations

from django.db.models import Q
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from content.models import (
    CategoryClasses,
    CategoryMaladies,
    CategoryPharmacologie,
    MicroArticlePage,
)
from learning.models import LessonProgress

from .pagination import FeedCursorPagination
from .serializers import FeedItemSerializer, MicroDetailSerializer


def _cover_url(page: MicroArticlePage) -> str | None:
    if not page.cover_image_id:
        return None
    try:
        return page.cover_image.file.url
    except Exception:
        return None


def _key_points(page: MicroArticlePage) -> list[str]:
    return [block.value for block in page.key_points]


def _tag_payload(page: MicroArticlePage) -> list[dict]:
    return [{"id": t.id, "name": t.name, "slug": t.slug} for t in page.tags.all()]


def _cat_payload(qs) -> list[dict]:
    return [{"id": c.id, "name": c.name, "slug": c.slug} for c in qs.all()]


def _questions_payload(page: MicroArticlePage) -> list[dict]:
    rows = (
        page.microarticle_questions.select_related("question")
        .all()
        .order_by("sort_order")
    )
    return [
        {
            "id": r.question_id,
            "type": r.question.type,
            "prompt": r.question.prompt,
            "choices": r.question.choices,
            "correct_answers": r.question.correct_answers,
            "explanation": r.question.explanation,
            "difficulty": r.question.difficulty,
            "references": r.question.references,
        }

        for r in rows
    ]

def _taxonomy_model(taxonomy: str):
    if taxonomy == "pharmacologie":
        return CategoryPharmacologie, "categories_pharmacologie"
    if taxonomy == "maladies":
        return CategoryMaladies, "categories_maladies"
    if taxonomy == "classes":
        return CategoryClasses, "categories_classes"
    return None, None


def _apply_tree_filter(qs, *, taxonomy: str, node_id: int, scope: str):
    model, rel = _taxonomy_model(taxonomy)
    if model is None:
        return qs, False

    node = model.objects.filter(id=node_id).first()
    if node is None:
        return qs, False

    if scope == "exact":
        return qs.filter(**{rel: node}), True

    if scope == "subtree":
        return qs.filter(**{f"{rel}__path__startswith": node.path}), True

    return qs, False


def _parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _progress_map(user, lesson_ids: list[int]) -> dict[int, dict]:
    if not user.is_authenticated or not lesson_ids:
        return {}
    rows = LessonProgress.objects.filter(user=user, lesson_id__in=lesson_ids)
    return {
        r.lesson_id: {
            "seen": r.seen,
            "completed": r.completed,
            "percent": r.percent,
            "time_ms": r.time_ms,
            "score_best": r.score_best,
            "score_last": r.score_last,
            "updated_at": r.updated_at,
            "last_seen_at": r.last_seen_at,
        }
        for r in rows
    }


class FeedView(ListAPIView):
    pagination_class = FeedCursorPagination
    serializer_class = FeedItemSerializer

    def get_queryset(self):
        qs = (
            MicroArticlePage.objects.live()
            .public()
            .select_related("cover_image")
            .prefetch_related(
                "tags",
                "categories_pharmacologie",
                "categories_maladies",
                "categories_classes",
            )
            .order_by("-first_published_at")
        )

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title_question__icontains=q) | Q(answer_express__icontains=q))

        tags = self.request.query_params.get("tags")
        if tags:
            tag_slugs = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_slugs:
                qs = qs.filter(tags__slug__in=tag_slugs)

        cat_p = self.request.query_params.get("category_pharmacologie")
        if cat_p:
            qs = qs.filter(categories_pharmacologie__slug=cat_p)

        cat_m = self.request.query_params.get("category_maladies")
        if cat_m:
            qs = qs.filter(categories_maladies__slug=cat_m)

        cat_c = self.request.query_params.get("category_classes")
        if cat_c:
            qs = qs.filter(categories_classes__slug=cat_c)

        used_tree_filter = False

        exact_p = _parse_int(self.request.query_params.get("category_pharmacologie_exact"))
        if exact_p is not None:
            qs, used_tree_filter = _apply_tree_filter(
                qs, taxonomy="pharmacologie", node_id=exact_p, scope="exact"
            )

        subtree_p = _parse_int(self.request.query_params.get("category_pharmacologie_subtree"))
        if subtree_p is not None:
            qs, used_tree_filter = _apply_tree_filter(
                qs, taxonomy="pharmacologie", node_id=subtree_p, scope="subtree"
            )

        exact_m = _parse_int(self.request.query_params.get("category_maladies_exact"))
        if exact_m is not None:
            qs, used_tree_filter = _apply_tree_filter(
                qs, taxonomy="maladies", node_id=exact_m, scope="exact"
            )

        subtree_m = _parse_int(self.request.query_params.get("category_maladies_subtree"))
        if subtree_m is not None:
            qs, used_tree_filter = _apply_tree_filter(
                qs, taxonomy="maladies", node_id=subtree_m, scope="subtree"
            )

        exact_c = _parse_int(self.request.query_params.get("category_classes_exact"))
        if exact_c is not None:
            qs, used_tree_filter = _apply_tree_filter(
                qs, taxonomy="classes", node_id=exact_c, scope="exact"
            )

        subtree_c = _parse_int(self.request.query_params.get("category_classes_subtree"))
        if subtree_c is not None:
            qs, used_tree_filter = _apply_tree_filter(
                qs, taxonomy="classes", node_id=subtree_c, scope="subtree"
            )

        taxonomy = self.request.query_params.get("taxonomy")
        category = _parse_int(self.request.query_params.get("category"))
        scope = self.request.query_params.get("scope")
        if not used_tree_filter and taxonomy and category is not None and scope:
            qs, _ = _apply_tree_filter(qs, taxonomy=taxonomy, node_id=category, scope=scope)

        return qs.distinct()

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        ids = [p.id for p in page]
        progress = _progress_map(request.user, ids)

        data = [
            {
                "id": p.id,
                "slug": p.slug,
                "title_question": p.title_question,
                "answer_express": p.answer_express,
                "takeaway": p.takeaway,
                "key_points": _key_points(p),
                "cover_image_url": _cover_url(p),
                "tags": _tag_payload(p),
                "categories_pharmacologie": _cat_payload(p.categories_pharmacologie),
                "categories_maladies": _cat_payload(p.categories_maladies),
                "categories_classes": _cat_payload(p.categories_classes),
                "published_at": p.first_published_at,
                "progress": progress.get(p.id),
            }
            for p in page
        ]

        serializer = self.get_serializer(data, many=True)
        return self.get_paginated_response(serializer.data)


class MicroBySlugView(RetrieveAPIView):
    serializer_class = MicroDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return (
            MicroArticlePage.objects.live()
            .public()
            .select_related("cover_image")
            .prefetch_related(
                "tags",
                "categories_pharmacologie",
                "categories_maladies",
                "categories_classes",
                "microarticle_questions__question",
            )
        )

    def retrieve(self, request, *args, **kwargs):
        page: MicroArticlePage = self.get_object()
        progress = _progress_map(request.user, [page.id]).get(page.id)

        data = {
            "id": page.id,
            "slug": page.slug,
            "title_question": page.title_question,
            "answer_express": page.answer_express,
            "takeaway": page.takeaway,
            "key_points": _key_points(page),
            "cover_image_url": _cover_url(page),
            "links": [b.value for b in page.links] if page.links else [],
            "see_more": [{"type": b.block_type, "value": b.value} for b in page.see_more] if page.see_more else [],
            "tags": _tag_payload(page),
            "categories_pharmacologie": _cat_payload(page.categories_pharmacologie),
            "categories_maladies": _cat_payload(page.categories_maladies),
            "categories_classes": _cat_payload(page.categories_classes),
            "questions": _questions_payload(page),
            "published_at": page.first_published_at,
            "progress": progress,
        }
        serializer = self.get_serializer(data)
        return Response(serializer.data)


class MicroByIdView(MicroBySlugView):
    lookup_field = "id"
    lookup_url_kwarg = "id"


class CategoryResolveView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        taxonomy = request.query_params.get("taxonomy")
        path = request.query_params.get("path")
        if not taxonomy or not path:
            return Response({"detail": "taxonomy and path are required."}, status=400)

        model, _ = _taxonomy_model(taxonomy)
        if model is None:
            return Response({"detail": "Unknown taxonomy."}, status=400)

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

        breadcrumb_nodes = node.get_ancestors(inclusive=True)
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
