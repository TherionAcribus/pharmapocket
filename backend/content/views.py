from django.db.models import Q
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    CategoryClasses,
    CategoryMaladies,
    CategoryPharmacologie,
    MicroArticlePage,
    Source,
)
from .pagination import MicroArticleCursorPagination
from .serializers import MicroArticleDetailSerializer, MicroArticleListSerializer


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


class MicroArticleListView(ListAPIView):
    serializer_class = MicroArticleListSerializer
    pagination_class = MicroArticleCursorPagination

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
            .order_by("-first_published_at", "-id")
        )

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title_question__icontains=q) | Q(answer_express__icontains=q))

        tags = self.request.query_params.get("tags")
        if tags:
            tag_slugs = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_slugs:
                invalid = [t for t in tag_slugs if slugify(t) != t]
                if invalid:
                    raise DRFValidationError(
                        {
                            "tags": "tags must be a comma-separated list of slugs.",
                            "invalid": invalid,
                        }
                    )
                qs = qs.filter(tags__slug__in=tag_slugs)

        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__name__iexact=tag)

        used_tree_filter = False

        taxonomy = self.request.query_params.get("taxonomy")
        node = _parse_int(self.request.query_params.get("node"))
        scope = self.request.query_params.get("scope")
        if taxonomy and node is not None and scope:
            qs, used_tree_filter = _apply_tree_filter(qs, taxonomy=taxonomy, node_id=node, scope=scope)

        taxonomy2 = self.request.query_params.get("taxonomy")
        category = _parse_int(self.request.query_params.get("category"))
        scope2 = self.request.query_params.get("scope")
        if not used_tree_filter and taxonomy2 and category is not None and scope2:
            qs, _ = _apply_tree_filter(qs, taxonomy=taxonomy2, node_id=category, scope=scope2)

        return qs.distinct()

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        data = [
            {
                "id": p.id,
                "slug": p.slug,
                "title_question": p.title_question,
                "answer_express": p.answer_express,
                "takeaway": p.takeaway,
                "key_points": _key_points(p),
                "cover_image_url": _cover_url(p),
                "tags": list(p.tags.values_list("name", flat=True)),
                "tags_payload": _tag_payload(p),
                "categories_pharmacologie_payload": _cat_payload(p.categories_pharmacologie),
                "categories_maladies_payload": _cat_payload(p.categories_maladies),
                "categories_classes_payload": _cat_payload(p.categories_classes),
                "published_at": p.first_published_at,
            }
            for p in page
        ]
        serializer = self.get_serializer(data, many=True)
        return self.get_paginated_response(serializer.data)


class MicroArticleDetailView(RetrieveAPIView):
    serializer_class = MicroArticleDetailSerializer
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
            .specific()
        )

    def retrieve(self, request, *args, **kwargs):
        page: MicroArticlePage = self.get_object()
        data = {
            "id": page.id,
            "slug": page.slug,
            "title_question": page.title_question,
            "answer_express": page.answer_express,
            "takeaway": page.takeaway,
            "key_points": _key_points(page),
            "cover_image_url": _cover_url(page),
            "links": page.links.stream_data if page.links else [],
            "see_more": page.see_more.stream_data if page.see_more else [],
            "tags": list(page.tags.values_list("name", flat=True)),
            "categories_pharmacologie": list(page.categories_pharmacologie.values_list("name", flat=True)),
            "categories_maladies": list(page.categories_maladies.values_list("name", flat=True)),
            "categories_classes": list(page.categories_classes.values_list("name", flat=True)),
            "tags_payload": _tag_payload(page),
            "categories_pharmacologie_payload": _cat_payload(page.categories_pharmacologie),
            "categories_maladies_payload": _cat_payload(page.categories_maladies),
            "categories_classes_payload": _cat_payload(page.categories_classes),
            "questions": _questions_payload(page),
            "published_at": page.first_published_at,
        }
        serializer = self.get_serializer(data)
        return Response(serializer.data)


class SourceSearchSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    kind = serializers.CharField(allow_blank=True, allow_null=True)
    url = serializers.URLField(allow_null=True, required=False)
    publisher = serializers.CharField(allow_blank=True, required=False)
    author = serializers.CharField(allow_blank=True, required=False)
    publication_date = serializers.DateField(allow_null=True, required=False)
    accessed_date = serializers.DateField(allow_null=True, required=False)


class SourceSearchView(ListAPIView):
    serializer_class = SourceSearchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Source.objects.all().order_by("name")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(publisher__icontains=q)
                | Q(author__icontains=q)
            )
        return qs
