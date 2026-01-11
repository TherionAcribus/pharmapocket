from datetime import date, datetime
import logging

from django.db.models import Q
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from wagtail.documents.models import Document

from .models import CategoryMedicament, CategoryMaladies, CategoryTheme, MicroArticlePage, SavedMicroArticle, Source
from .pagination import MicroArticleCursorPagination
from .serializers import MicroArticleDetailSerializer, MicroArticleListSerializer

logger = logging.getLogger(__name__)


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
    if taxonomy == "theme":
        return CategoryTheme, "categories_theme"
    if taxonomy == "maladies":
        return CategoryMaladies, "categories_maladies"
    if taxonomy == "medicament":
        return CategoryMedicament, "categories_medicament"
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


def _sanitize_stream_value(value):
    if value is None:
        return None

    if isinstance(value, Source):
        return {
            "id": value.id,
            "name": value.name,
            "kind": value.kind,
            "url": value.url,
            "publisher": value.publisher,
            "author": value.author,
            "publication_date": value.publication_date.isoformat() if value.publication_date else None,
            "accessed_date": value.accessed_date.isoformat() if value.accessed_date else None,
            "notes": value.notes,
        }

    if isinstance(value, Document):
        try:
            url = value.file.url
        except Exception:
            url = None
        return {"id": value.id, "title": value.title, "url": url}

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if isinstance(value, str):
        return value

    if isinstance(value, dict):
        return {k: _sanitize_stream_value(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [_sanitize_stream_value(v) for v in value]

    if hasattr(value, "source") and isinstance(getattr(value, "source", None), str):
        # Wagtail RichText
        return str(value)

    if hasattr(value, "__iter__") and hasattr(value, "items"):
        try:
            return {k: _sanitize_stream_value(v) for k, v in dict(value).items()}
        except Exception:
            pass

    return str(value)


def _reference_payload(value: dict) -> dict:
    # value schema from ReferenceBlock: {"source": Source, "note": str, "page": str, "document": Document}
    source = value.get("source")
    document = value.get("document")

    source_payload = _sanitize_stream_value(source)

    document_payload = _sanitize_stream_value(document)

    return {
        "source": source_payload,
        "note": value.get("note") or "",
        "page": value.get("page") or "",
        "document": document_payload,
    }


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
                "categories_theme",
                "categories_maladies",
                "categories_medicament",
            )
            .order_by("-first_published_at", "-id")
        )

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(answer_express__icontains=q))

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
                "title": p.title,
                "answer_express": p.answer_express,
                "takeaway": p.takeaway,
                "key_points": _key_points(p),
                "cover_image_url": _cover_url(p),
                "tags": list(p.tags.values_list("name", flat=True)),
                "tags_payload": _tag_payload(p),
                "categories_theme_payload": _cat_payload(p.categories_theme),
                "categories_maladies_payload": _cat_payload(p.categories_maladies),
                "categories_medicament_payload": _cat_payload(p.categories_medicament),
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
        print("[MicroArticleDetailView] slug=%s" % self.kwargs["slug"])
        return (
            MicroArticlePage.objects.live()
            .public()
            .select_related("cover_image")
            .prefetch_related(
                "tags",
                "categories_theme",
                "categories_maladies",
                "categories_medicament",
                "microarticle_questions__question",
            )
            .specific()
        )

    def retrieve(self, request, *args, **kwargs):
        page: MicroArticlePage = self.get_object()

        print(
            "[MicroArticleDetailView] slug=%s answer_detail_len=%s sources_len=%s see_more_len=%s links_len=%s"
            % (
                page.slug,
                len((page.answer_detail or "").strip()),
                len(page.sources or []),
                len(page.see_more or []),
                len(page.links or []),
            )
        )

        see_more_blocks = (
            [{"type": b.block_type, "value": _sanitize_stream_value(b.value)} for b in page.see_more]
            if page.see_more
            else []
        )

        links_blocks = (
            [{"type": b.block_type, "value": _sanitize_stream_value(b.value)} for b in page.links]
            if page.links
            else []
        )

        # Inject legacy fields into see_more so the frontend always receives long content + sources
        if page.answer_detail and page.answer_detail.strip():
            see_more_blocks = [{"type": "detail", "value": page.answer_detail}] + see_more_blocks
        if page.sources:
            refs = []
            for b in page.sources:
                try:
                    refs.append(_reference_payload(b.value))
                except Exception:
                    continue
            if refs:
                see_more_blocks = see_more_blocks + [{"type": "references", "value": refs}]

        data = {
            "id": page.id,
            "slug": page.slug,
            "title": page.title,
            "answer_express": page.answer_express,
            "takeaway": page.takeaway,
            "key_points": _key_points(page),
            "cover_image_url": _cover_url(page),
            "links": links_blocks,
            "see_more": see_more_blocks,
            "tags": list(page.tags.values_list("name", flat=True)),
            "categories_theme": list(page.categories_theme.values_list("name", flat=True)),
            "categories_maladies": list(page.categories_maladies.values_list("name", flat=True)),
            "categories_medicament": list(page.categories_medicament.values_list("name", flat=True)),
            "tags_payload": _tag_payload(page),
            "categories_theme_payload": _cat_payload(page.categories_theme),
            "categories_maladies_payload": _cat_payload(page.categories_maladies),
            "categories_medicament_payload": _cat_payload(page.categories_medicament),
            "questions": _questions_payload(page),
            "published_at": page.first_published_at,
        }

        if request.user.is_authenticated:
            data["is_saved"] = SavedMicroArticle.objects.filter(
                user=request.user,
                microarticle_id=page.id,
            ).exists()

        serializer = self.get_serializer(data)
        return Response(serializer.data)


class SavedMicroArticleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            SavedMicroArticle.objects.filter(user=request.user)
            .select_related("microarticle", "microarticle__cover_image")
            .order_by("-created_at")
        )

        items = []
        for r in rows:
            p: MicroArticlePage = r.microarticle
            items.append(
                {
                    "id": p.id,
                    "slug": p.slug,
                    "title": p.title,
                    "answer_express": p.answer_express,
                    "takeaway": p.takeaway,
                    "key_points": _key_points(p),
                    "cover_image_url": _cover_url(p),
                    "tags": list(p.tags.values_list("name", flat=True)),
                    "published_at": p.first_published_at,
                }
            )

        return Response(items)

    def post(self, request):
        slug = request.data.get("slug") if isinstance(request.data, dict) else None
        if not slug or not isinstance(slug, str):
            raise DRFValidationError({"slug": "slug is required"})

        page = (
            MicroArticlePage.objects.live()
            .public()
            .filter(slug=slug)
            .specific()
            .first()
        )
        if page is None:
            raise DRFValidationError({"slug": "Unknown microarticle"})

        SavedMicroArticle.objects.get_or_create(user=request.user, microarticle=page)
        return Response({"saved": True})


class SavedMicroArticleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug: str):
        page = MicroArticlePage.objects.filter(slug=slug).first()
        if page is None:
            return Response({"saved": False})
        return Response(
            {
                "saved": SavedMicroArticle.objects.filter(
                    user=request.user,
                    microarticle_id=page.id,
                ).exists()
            }
        )

    def delete(self, request, slug: str):
        page = MicroArticlePage.objects.filter(slug=slug).first()
        if page is None:
            return Response(status=204)
        SavedMicroArticle.objects.filter(user=request.user, microarticle_id=page.id).delete()
        return Response(status=204)


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
