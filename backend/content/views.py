from datetime import date, datetime
import logging

from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from wagtail.documents.models import Document
from wagtail.images import get_image_model

from .models import (
    CategoryMedicament,
    CategoryMaladies,
    CategoryPharmacologie,
    CategoryTheme,
    Deck,
    DeckCard,
    LandingPage,
    MicroArticlePage,
    MicroArticleReadState,
    Source,
    UserDeckProgress,
)
from .pagination import MicroArticleCursorPagination
from .serializers import MicroArticleDetailSerializer, MicroArticleListSerializer

logger = logging.getLogger(__name__)


def _require_staff(request):
    if not getattr(request, "user", None) or not request.user.is_authenticated:
        return Response(status=401)
    if not getattr(request.user, "is_staff", False):
        return Response(status=403)
    return None


def _stream_items(field) -> list:
    if not field:
        return []
    try:
        return list(field)  # StreamValue iterable (StreamField)
    except Exception:
        try:
            return list(field.stream_data)
        except Exception:
            return []


class LandingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        page = LandingPage.objects.live().public().specific().first()
        if page is None:
            return Response({"detail": "Landing page not configured."}, status=404)

        bullets: list[str] = []
        for block in _stream_items(getattr(page, "hero_bullets", None)):
            # block can be StreamChild or dict
            val = getattr(block, "value", None) if not isinstance(block, dict) else block.get("value")
            if isinstance(val, str) and val.strip():
                bullets.append(val)

        steps: list[dict] = []
        for block in _stream_items(getattr(page, "steps", None)):
            value = getattr(block, "value", None) if not isinstance(block, dict) else block.get("value")
            btype = getattr(block, "block_type", None) if not isinstance(block, dict) else block.get("type")
            if btype not in ("step", None):  # None means StructBlock iteration direct
                continue
            if not isinstance(value, dict):
                continue
            title = value.get("title")
            detail = value.get("detail")
            if isinstance(title, str) and isinstance(detail, str):
                steps.append({"title": title, "detail": detail})

        cards: list[dict] = []
        for block in _stream_items(getattr(page, "cards", None)):
            value = getattr(block, "value", None) if not isinstance(block, dict) else block.get("value")
            btype = getattr(block, "block_type", None) if not isinstance(block, dict) else block.get("type")
            if btype not in ("card", None):
                continue
            if not isinstance(value, dict):
                continue
            cards.append(
                {
                    "title": value.get("title") if isinstance(value.get("title"), str) else "",
                    "summary": value.get("summary") if isinstance(value.get("summary"), str) else "",
                    "cta_label": value.get("cta_label") if isinstance(value.get("cta_label"), str) else "",
                    "href": value.get("href") if isinstance(value.get("href"), str) else "",
                }
            )

        return Response(
            {
                "title": page.title,
                "hero_title": page.hero_title,
                "hero_subtitle": page.hero_subtitle,
                "hero_bullets": bullets,
                "steps": steps,
                "cards": cards,
                "primary_cta_label": page.primary_cta_label,
                "primary_cta_target": page.primary_cta_target,
                "secondary_cta_label": page.secondary_cta_label,
                "secondary_cta_target": page.secondary_cta_target,
            }
        )


def _get_or_create_default_deck(user) -> Deck:
    deck = Deck.objects.filter(user=user, type=Deck.DeckType.USER, is_default=True).first()
    if deck is not None:
        return deck

    Deck.objects.filter(user=user, type=Deck.DeckType.USER, is_default=True).update(is_default=False)
    existing = Deck.objects.filter(user=user, type=Deck.DeckType.USER, name="Mes cartes").first()
    if existing is not None:
        existing.is_default = True
        existing.sort_order = 0
        existing.save(update_fields=["is_default", "sort_order", "updated_at"])
        return existing

    return Deck.objects.create(
        user=user,
        type=Deck.DeckType.USER,
        name="Mes cartes",
        is_default=True,
        sort_order=0,
    )


def _microarticle_list_item(p: MicroArticlePage) -> dict:
    return {
        "id": p.id,
        "slug": p.slug,
        "title": p.title,
        "answer_express": p.answer_express,
        "takeaway": p.takeaway,
        "key_points": _key_points(p),
        "cover_image_url": _cover_url(p),
        "cover_image_credit": _cover_credit(p),
        "cover_image": _cover_payload(p),
        "tags": list(p.tags.values_list("name", flat=True)),
        "published_at": p.first_published_at,
    }


def _cover_url(page: MicroArticlePage) -> str | None:
    if not page.cover_image_id:
        return None
    try:
        return page.cover_image.file.url
    except Exception:
        return None


def _cover_credit(page: MicroArticlePage) -> str | None:
    if not page.cover_image_id:
        return None
    try:
        text = getattr(page.cover_image, "credit_text", None)
        if callable(text):
            value = text()
        else:
            value = str(text) if text else ""
        return value or None
    except Exception:
        return None


def _cover_payload(page: MicroArticlePage) -> dict | None:
    if not page.cover_image_id:
        return None
    try:
        return _image_payload(page.cover_image)
    except Exception:
        return None


def _image_payload(image) -> dict:
    try:
        url = image.file.url
    except Exception:
        url = None

    license_name = None
    license_url = None
    try:
        if getattr(image, "license_id", None):
            license_obj = getattr(image, "license", None)
            license_name = getattr(license_obj, "name", None) or None
            license_url = getattr(license_obj, "url", None) or None
    except Exception:
        license_name = None
        license_url = None

    credit_text = None
    try:
        ct = getattr(image, "credit_text", None)
        if callable(ct):
            credit_text = ct() or None
        elif ct:
            credit_text = str(ct)
    except Exception:
        credit_text = None

    return {
        "id": image.id,
        "title": image.title,
        "url": url,
        "credit_text": credit_text,
        "credit_source_url": getattr(image, "credit_source_url", "") or "",
        "credit_license": license_name or getattr(image, "credit_license", "") or "",
        "credit_license_url": license_url or getattr(image, "credit_license_url", "") or "",
        "credit_author": getattr(image, "credit_author", "") or "",
        "credit_source": getattr(image, "credit_source", "") or "",
    }


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
    if taxonomy == "pharmacologie":
        return CategoryPharmacologie, "categories_pharmacologie"
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

    ImageModel = get_image_model()
    if isinstance(value, ImageModel):
        return _image_payload(value)

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
                "categories_pharmacologie",
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
                "cover_image_credit": _cover_credit(p),
                "cover_image": _cover_payload(p),
                "tags": list(p.tags.values_list("name", flat=True)),
                "tags_payload": _tag_payload(p),
                "categories_theme_payload": _cat_payload(p.categories_theme),
                "categories_maladies_payload": _cat_payload(p.categories_maladies),
                "categories_medicament_payload": _cat_payload(p.categories_medicament),
                "categories_pharmacologie_payload": _cat_payload(p.categories_pharmacologie),
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
                "categories_pharmacologie",
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
            "cover_image_credit": _cover_credit(page),
            "cover_image": _cover_payload(page),
            "links": links_blocks,
            "see_more": see_more_blocks,
            "tags": list(page.tags.values_list("name", flat=True)),
            "categories_theme": list(page.categories_theme.values_list("name", flat=True)),
            "categories_maladies": list(page.categories_maladies.values_list("name", flat=True)),
            "categories_medicament": list(page.categories_medicament.values_list("name", flat=True)),
            "categories_pharmacologie": list(page.categories_pharmacologie.values_list("name", flat=True)),
            "tags_payload": _tag_payload(page),
            "categories_theme_payload": _cat_payload(page.categories_theme),
            "categories_maladies_payload": _cat_payload(page.categories_maladies),
            "categories_medicament_payload": _cat_payload(page.categories_medicament),
            "categories_pharmacologie_payload": _cat_payload(page.categories_pharmacologie),
            "questions": _questions_payload(page),
            "published_at": page.first_published_at,
        }

        if request.user.is_authenticated:
            default_deck = Deck.objects.filter(
                user=request.user,
                type=Deck.DeckType.USER,
                is_default=True,
            ).first()
            if default_deck is None:
                data["is_saved"] = False
            else:
                data["is_saved"] = DeckCard.objects.filter(
                    deck=default_deck,
                    microarticle_id=page.id,
                ).exists()

        serializer = self.get_serializer(data)
        return Response(serializer.data)


class SavedMicroArticleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        default_deck = _get_or_create_default_deck(request.user)
        rows = (
            DeckCard.objects.filter(deck=default_deck)
            .select_related("microarticle", "microarticle__cover_image")
            .order_by("-added_at")
        )

        items = [_microarticle_list_item(r.microarticle) for r in rows]
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

        default_deck = _get_or_create_default_deck(request.user)
        DeckCard.objects.get_or_create(deck=default_deck, microarticle=page)
        return Response({"saved": True})


class SavedMicroArticleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug: str):
        page = MicroArticlePage.objects.filter(slug=slug).first()
        if page is None:
            return Response({"saved": False})
        default_deck = Deck.objects.filter(
            user=request.user,
            type=Deck.DeckType.USER,
            is_default=True,
        ).first()
        if default_deck is None:
            return Response({"saved": False})
        return Response(
            {"saved": DeckCard.objects.filter(deck=default_deck, microarticle_id=page.id).exists()}
        )

    def delete(self, request, slug: str):
        page = MicroArticlePage.objects.filter(slug=slug).first()
        if page is None:
            return Response(status=204)
        default_deck = Deck.objects.filter(
            user=request.user,
            type=Deck.DeckType.USER,
            is_default=True,
        ).first()
        if default_deck is not None:
            DeckCard.objects.filter(deck=default_deck, microarticle_id=page.id).delete()
        return Response(status=204)


class DeckListSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()
    sort_order = serializers.IntegerField()
    cards_count = serializers.IntegerField()


class DeckListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            req_type = self.request.query_params.get("type")
            if req_type == Deck.DeckType.OFFICIAL:
                return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        req_type = request.query_params.get("type")
        if req_type == Deck.DeckType.OFFICIAL:
            qs = (
                Deck.objects.filter(type=Deck.DeckType.OFFICIAL, status=Deck.Status.PUBLISHED)
                .select_related("cover_image")
                .order_by("sort_order", "id")
                .annotate(cards_count=models.Count("deck_cards"))
            )

            progress_by_deck_id: dict[int, UserDeckProgress] = {}
            if request.user.is_authenticated:
                progress_rows = UserDeckProgress.objects.filter(
                    user=request.user,
                    deck_id__in=list(qs.values_list("id", flat=True)),
                )
                progress_by_deck_id = {p.deck_id: p for p in progress_rows}

            items: list[dict] = []
            for d in qs:
                p = progress_by_deck_id.get(d.id)
                cards_count = int(getattr(d, "cards_count", 0) or 0)
                done = int(getattr(p, "cards_done_count", 0) or 0) if p else 0
                progress_pct = int(round((done / cards_count) * 100)) if cards_count else 0
                cover_payload = _image_payload(d.cover_image) if getattr(d, "cover_image_id", None) else None
                items.append(
                    {
                        "id": d.id,
                        "name": d.name,
                        "description": d.description,
                        "cover_image_url": cover_payload.get("url") if cover_payload else None,
                        "cover_image_credit": cover_payload.get("credit_text") if cover_payload else None,
                        "cover_image": cover_payload,
                        "difficulty": d.difficulty,
                        "estimated_minutes": d.estimated_minutes,
                        "status": d.status,
                        "type": d.type,
                        "cards_count": cards_count,
                        "progress": (
                            {
                                "started_at": p.started_at,
                                "last_seen_at": p.last_seen_at,
                                "cards_seen_count": p.cards_seen_count,
                                "cards_done_count": p.cards_done_count,
                                "progress_pct": progress_pct,
                                "mode_last": p.mode_last,
                                "last_card_id": p.last_card_id,
                            }
                            if p
                            else None
                        ),
                    }
                )
            return Response(items)

        _get_or_create_default_deck(request.user)

        qs = (
            Deck.objects.filter(user=request.user, type=Deck.DeckType.USER)
            .order_by("sort_order", "id")
            .annotate(cards_count=models.Count("deck_cards"))
        )
        items = [
            {
                "id": d.id,
                "name": d.name,
                "is_default": bool(d.is_default),
                "sort_order": int(d.sort_order),
                "cards_count": int(getattr(d, "cards_count", 0) or 0),
            }
            for d in qs
        ]
        serializer = DeckListSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        name = request.data.get("name") if isinstance(request.data, dict) else None
        if not name or not isinstance(name, str):
            raise DRFValidationError({"name": "name is required"})
        name = name.strip()
        if not name:
            raise DRFValidationError({"name": "name is required"})

        _get_or_create_default_deck(request.user)
        sort_order = (
            Deck.objects.filter(user=request.user, type=Deck.DeckType.USER)
            .aggregate(models.Max("sort_order"))
            .get("sort_order__max")
            or 0
        )
        deck = Deck.objects.create(
            user=request.user,
            type=Deck.DeckType.USER,
            name=name,
            sort_order=int(sort_order) + 1,
        )
        return Response({"id": deck.id, "name": deck.name, "is_default": bool(deck.is_default), "sort_order": deck.sort_order})


class DeckDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id).first()
        if deck is None:
            return Response(status=404)

        if deck.type == Deck.DeckType.OFFICIAL:
            if deck.status != Deck.Status.PUBLISHED:
                return Response(status=404)
        else:
            if not request.user.is_authenticated:
                return Response(status=404)
            if deck.user_id != request.user.id:
                return Response(status=404)

        cards_qs = DeckCard.objects.filter(deck=deck).select_related("microarticle", "microarticle__cover_image")
        if deck.type == Deck.DeckType.OFFICIAL:
            cards_qs = cards_qs.order_by("sort_order", "id")
        else:
            cards_qs = cards_qs.order_by("-added_at")

        cards = []
        for r in cards_qs:
            item = _microarticle_list_item(r.microarticle)
            item["position"] = r.sort_order
            item["sort_order"] = r.sort_order
            item["is_optional"] = bool(r.is_optional)
            item["notes"] = r.notes
            cards.append(item)

        deck_cover_payload = _image_payload(deck.cover_image) if getattr(deck, "cover_image_id", None) else None

        payload = {
            "id": deck.id,
            "name": deck.name,
            "description": deck.description,
            "cover_image_url": deck_cover_payload.get("url") if deck_cover_payload else None,
            "cover_image_credit": deck_cover_payload.get("credit_text") if deck_cover_payload else None,
            "cover_image": deck_cover_payload,
            "difficulty": deck.difficulty,
            "estimated_minutes": deck.estimated_minutes,
            "status": deck.status,
            "type": deck.type,
            "cards_count": len(cards),
            "cards": cards,
        }

        if request.user.is_authenticated and deck.type == Deck.DeckType.OFFICIAL:
            progress = UserDeckProgress.objects.filter(user=request.user, deck=deck).first()
            if progress is not None:
                payload["progress"] = {
                    "started_at": progress.started_at,
                    "last_seen_at": progress.last_seen_at,
                    "cards_seen_count": progress.cards_seen_count,
                    "cards_done_count": progress.cards_done_count,
                    "mode_last": progress.mode_last,
                    "last_card_id": progress.last_card_id,
                }
            else:
                payload["progress"] = None

        return Response(payload)

    def patch(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)

        name = request.data.get("name") if isinstance(request.data, dict) else None
        sort_order = request.data.get("sort_order") if isinstance(request.data, dict) else None

        update_fields = ["updated_at"]
        if isinstance(name, str):
            deck.name = name.strip()
            update_fields.append("name")
        if sort_order is not None:
            try:
                deck.sort_order = int(sort_order)
                update_fields.append("sort_order")
            except (TypeError, ValueError):
                raise DRFValidationError({"sort_order": "sort_order must be an integer"})

        if len(update_fields) == 1:
            raise DRFValidationError({"detail": "No fields to update"})

        deck.save(update_fields=update_fields)
        return Response({"id": deck.id, "name": deck.name, "is_default": bool(deck.is_default), "sort_order": deck.sort_order})

    def delete(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)
        if deck.is_default:
            raise DRFValidationError({"detail": "Default deck cannot be deleted"})
        deck.delete()
        return Response(status=204)


class DeckSetDefaultView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)

        Deck.objects.filter(user=request.user, type=Deck.DeckType.USER, is_default=True).exclude(id=deck.id).update(is_default=False)
        if not deck.is_default:
            deck.is_default = True
            deck.save(update_fields=["is_default", "updated_at"])
        return Response({"ok": True, "default_deck_id": deck.id})


class DeckCardsView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id).first()
        if deck is None:
            return Response(status=404)

        if deck.type == Deck.DeckType.OFFICIAL:
            if deck.status != Deck.Status.PUBLISHED:
                return Response(status=404)
        else:
            if not request.user.is_authenticated:
                return Response(status=404)
            if deck.user_id != request.user.id:
                return Response(status=404)

        search = request.query_params.get("search")
        qs = (
            DeckCard.objects.filter(deck=deck)
            .select_related("microarticle", "microarticle__cover_image")
        )
        if deck.type == Deck.DeckType.OFFICIAL:
            qs = qs.order_by("sort_order", "id")
        else:
            qs = qs.order_by("-added_at")
        if search and isinstance(search, str) and search.strip():
            s = search.strip()
            qs = qs.filter(
                Q(microarticle__title__icontains=s) | Q(microarticle__answer_express__icontains=s)
            )
        card_ids = list(qs.values_list("microarticle_id", flat=True))
        deck_counts_by_card_id = {}
        if request.user.is_authenticated and card_ids:
            deck_counts_by_card_id = {
                row["microarticle_id"]: row["decks_count"]
                for row in DeckCard.objects.filter(
                    deck__user=request.user,
                    deck__type=Deck.DeckType.USER,
                    microarticle_id__in=card_ids,
                )
                .values("microarticle_id")
                .annotate(decks_count=models.Count("deck_id", distinct=True))
            }

        items: list[dict] = []
        for r in qs:
            item = _microarticle_list_item(r.microarticle)
            item["decks_count"] = int(deck_counts_by_card_id.get(r.microarticle_id, 1))
            item["position"] = r.sort_order
            item["sort_order"] = r.sort_order
            item["is_optional"] = bool(r.is_optional)
            item["notes"] = r.notes
            items.append(item)
        return Response({"count": len(items), "results": items})

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(
            id=deck_id,
            user=request.user,
            type=Deck.DeckType.USER,
        ).first()
        if deck is None:
            return Response(status=404)

        card_id = request.data.get("card_id") if isinstance(request.data, dict) else None
        if card_id is None:
            raise DRFValidationError({"card_id": "card_id is required"})
        try:
            microarticle_id = int(card_id)
        except (TypeError, ValueError):
            raise DRFValidationError({"card_id": "card_id must be an integer"})

        DeckCard.objects.get_or_create(deck=deck, microarticle_id=microarticle_id)
        return Response({"ok": True})


class OfficialDeckStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(
            id=deck_id,
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
        ).first()
        if deck is None:
            return Response(status=404)

        obj, created = UserDeckProgress.objects.get_or_create(
            user=request.user,
            deck=deck,
            defaults={"last_seen_at": timezone.now()},
        )
        if not created and obj.last_seen_at is None:
            obj.last_seen_at = timezone.now()
            obj.save(update_fields=["last_seen_at"])

        return Response(
            {
                "deck_id": deck.id,
                "started_at": obj.started_at,
                "last_seen_at": obj.last_seen_at,
                "cards_seen_count": obj.cards_seen_count,
                "cards_done_count": obj.cards_done_count,
                "mode_last": obj.mode_last,
                "last_card_id": obj.last_card_id,
            }
        )


class OfficialDeckProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(
            id=deck_id,
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
        ).first()
        if deck is None:
            return Response(status=404)

        if not isinstance(request.data, dict):
            raise DRFValidationError({"detail": "Invalid JSON body"})

        mode_last = request.data.get("mode_last")
        last_card_id = request.data.get("last_card_id")
        cards_seen_count = request.data.get("cards_seen_count")
        cards_done_count = request.data.get("cards_done_count")

        update_fields: list[str] = ["last_seen_at"]

        obj, _ = UserDeckProgress.objects.get_or_create(
            user=request.user,
            deck=deck,
        )
        obj.last_seen_at = timezone.now()

        if isinstance(mode_last, str) and mode_last in UserDeckProgress.ProgressMode.values:
            obj.mode_last = mode_last
            update_fields.append("mode_last")

        if last_card_id is not None:
            try:
                obj.last_card_id = int(last_card_id)
                update_fields.append("last_card")
            except (TypeError, ValueError):
                raise DRFValidationError({"last_card_id": "last_card_id must be an integer"})

        if cards_seen_count is not None:
            try:
                obj.cards_seen_count = max(0, int(cards_seen_count))
                update_fields.append("cards_seen_count")
            except (TypeError, ValueError):
                raise DRFValidationError({"cards_seen_count": "cards_seen_count must be an integer"})

        if cards_done_count is not None:
            try:
                obj.cards_done_count = max(0, int(cards_done_count))
                update_fields.append("cards_done_count")
            except (TypeError, ValueError):
                raise DRFValidationError({"cards_done_count": "cards_done_count must be an integer"})

        # Always persist last_seen_at
        obj.save(update_fields=list(dict.fromkeys(update_fields)))

        return Response(
            {
                "deck_id": deck.id,
                "started_at": obj.started_at,
                "last_seen_at": obj.last_seen_at,
                "cards_seen_count": obj.cards_seen_count,
                "cards_done_count": obj.cards_done_count,
                "mode_last": obj.mode_last,
                "last_card_id": obj.last_card_id,
            }
        )


class DeckCardDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, deck_id: int, card_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)
        DeckCard.objects.filter(deck=deck, microarticle_id=card_id).delete()
        return Response(status=204)


def _admin_pack_qs():
    return Deck.objects.filter(type=Deck.DeckType.OFFICIAL).select_related("cover_image")


def _admin_pack_payload(deck: Deck) -> dict:
    cover_payload = _image_payload(deck.cover_image) if getattr(deck, "cover_image_id", None) else None
    return {
        "id": deck.id,
        "name": deck.name,
        "description": deck.description,
        "difficulty": deck.difficulty,
        "estimated_minutes": deck.estimated_minutes,
        "status": deck.status,
        "type": deck.type,
        "sort_order": deck.sort_order,
        "cover_image": cover_payload,
        "cover_image_url": cover_payload.get("url") if cover_payload else None,
        "cover_image_credit": cover_payload.get("credit_text") if cover_payload else None,
    }


class AdminPackListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        qs = _admin_pack_qs().order_by("sort_order", "id").annotate(cards_count=models.Count("deck_cards"))
        items = []
        for d in qs:
            payload = _admin_pack_payload(d)
            payload["cards_count"] = int(getattr(d, "cards_count", 0) or 0)
            items.append(payload)
        return Response(items)

    def post(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        payload = request.data if isinstance(request.data, dict) else {}
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise DRFValidationError({"name": "name is required"})

        description = payload.get("description")
        if description is not None and not isinstance(description, str):
            raise DRFValidationError({"description": "description must be a string"})

        difficulty = payload.get("difficulty")
        if difficulty is not None and not isinstance(difficulty, str):
            raise DRFValidationError({"difficulty": "difficulty must be a string"})

        estimated_minutes = payload.get("estimated_minutes")
        if estimated_minutes is not None:
            try:
                estimated_minutes = int(estimated_minutes)
            except (TypeError, ValueError):
                raise DRFValidationError({"estimated_minutes": "estimated_minutes must be an integer"})

        status = payload.get("status")
        if status is not None and (not isinstance(status, str) or status not in Deck.Status.values):
            raise DRFValidationError({"status": "invalid status"})

        cover_image_id = payload.get("cover_image_id")
        if cover_image_id in (None, ""):
            cover_image_id = None
        elif cover_image_id is not None:
            try:
                cover_image_id = int(cover_image_id)
            except (TypeError, ValueError):
                raise DRFValidationError({"cover_image_id": "cover_image_id must be an integer"})

        sort_order = payload.get("sort_order")
        if sort_order is None:
            sort_order = (
                Deck.objects.filter(type=Deck.DeckType.OFFICIAL)
                .aggregate(models.Max("sort_order"))
                .get("sort_order__max")
            )
            sort_order = int(sort_order) + 1 if sort_order is not None else 0
        else:
            try:
                sort_order = int(sort_order)
            except (TypeError, ValueError):
                raise DRFValidationError({"sort_order": "sort_order must be an integer"})

        deck = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            status=status or Deck.Status.DRAFT,
            user=None,
            name=name.strip(),
            description=(description or ""),
            difficulty=(difficulty or ""),
            estimated_minutes=estimated_minutes,
            cover_image_id=cover_image_id,
            is_default=False,
            sort_order=sort_order,
        )
        return Response(_admin_pack_payload(deck), status=201)


class AdminPackDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pack_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = _admin_pack_qs().filter(id=pack_id).first()
        if deck is None:
            return Response(status=404)

        cards_qs = (
            DeckCard.objects.filter(deck_id=deck.id)
            .select_related("microarticle", "microarticle__cover_image")
            .order_by("sort_order", "id")
        )
        cards = []
        for r in cards_qs:
            item = _microarticle_list_item(r.microarticle)
            item["deck_card_id"] = r.id
            item["sort_order"] = r.sort_order
            item["position"] = r.sort_order
            item["is_optional"] = bool(r.is_optional)
            item["notes"] = r.notes
            cards.append(item)

        out = _admin_pack_payload(deck)
        out["cards"] = cards
        out["cards_count"] = len(cards)
        return Response(out)

    def patch(self, request, pack_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = Deck.objects.filter(id=pack_id, type=Deck.DeckType.OFFICIAL).first()
        if deck is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        update_fields = ["updated_at"]

        if "name" in payload:
            name = payload.get("name")
            if not isinstance(name, str) or not name.strip():
                raise DRFValidationError({"name": "name must be a non-empty string"})
            deck.name = name.strip()
            update_fields.append("name")

        if "description" in payload:
            desc = payload.get("description")
            if desc is None:
                deck.description = ""
            elif not isinstance(desc, str):
                raise DRFValidationError({"description": "description must be a string"})
            else:
                deck.description = desc
            update_fields.append("description")

        if "difficulty" in payload:
            diff = payload.get("difficulty")
            if diff is None:
                deck.difficulty = ""
            elif not isinstance(diff, str):
                raise DRFValidationError({"difficulty": "difficulty must be a string"})
            else:
                deck.difficulty = diff
            update_fields.append("difficulty")

        if "estimated_minutes" in payload:
            v = payload.get("estimated_minutes")
            if v in (None, ""):
                deck.estimated_minutes = None
            else:
                try:
                    deck.estimated_minutes = int(v)
                except (TypeError, ValueError):
                    raise DRFValidationError({"estimated_minutes": "estimated_minutes must be an integer"})
            update_fields.append("estimated_minutes")

        if "status" in payload:
            st = payload.get("status")
            if not isinstance(st, str) or st not in Deck.Status.values:
                raise DRFValidationError({"status": "invalid status"})
            deck.status = st
            update_fields.append("status")

        if "cover_image_id" in payload:
            cid = payload.get("cover_image_id")
            if cid in (None, ""):
                deck.cover_image_id = None
            else:
                try:
                    deck.cover_image_id = int(cid)
                except (TypeError, ValueError):
                    raise DRFValidationError({"cover_image_id": "cover_image_id must be an integer"})
            update_fields.append("cover_image")

        if "sort_order" in payload:
            so = payload.get("sort_order")
            try:
                deck.sort_order = int(so)
            except (TypeError, ValueError):
                raise DRFValidationError({"sort_order": "sort_order must be an integer"})
            update_fields.append("sort_order")

        if len(update_fields) == 1:
            raise DRFValidationError({"detail": "No fields to update"})

        deck.type = Deck.DeckType.OFFICIAL
        deck.user_id = None
        deck.is_default = False
        deck.save(update_fields=update_fields)
        return Response(_admin_pack_payload(deck))

    def delete(self, request, pack_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = Deck.objects.filter(id=pack_id, type=Deck.DeckType.OFFICIAL).first()
        if deck is None:
            return Response(status=404)
        deck.delete()
        return Response(status=204)


class AdminMicroArticleSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        q = request.query_params.get("q")
        if not isinstance(q, str) or not q.strip():
            return Response([])
        s = q.strip()

        qs = (
            MicroArticlePage.objects.live()
            .public()
            .filter(Q(title__icontains=s) | Q(answer_express__icontains=s) | Q(slug__icontains=s))
            .order_by("title")
            .specific()
        )
        rows = []
        for p in qs[:30]:
            rows.append({"id": p.id, "slug": p.slug, "title": p.title})
        return Response(rows)


def _parse_bulk_tokens(raw: str) -> list[str]:
    if not raw:
        return []
    parts = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        parts.extend([p for p in line.replace(",", " ").replace(";", " ").split() if p])
    return [p.strip() for p in parts if p.strip()]


class AdminPackBulkAddView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pack_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = Deck.objects.filter(id=pack_id, type=Deck.DeckType.OFFICIAL).first()
        if deck is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        tokens: list[str] = []

        if isinstance(payload.get("items"), str):
            tokens = _parse_bulk_tokens(payload.get("items") or "")
        elif isinstance(payload.get("microarticle_ids"), list):
            tokens = [str(x) for x in payload.get("microarticle_ids")]
        elif isinstance(payload.get("slugs"), list):
            tokens = [str(x) for x in payload.get("slugs")]
        else:
            raise DRFValidationError({"detail": "Provide items (string) or microarticle_ids/slugs (list)"})

        existing_ids = set(
            DeckCard.objects.filter(deck_id=deck.id).values_list("microarticle_id", flat=True)
        )

        max_sort = (
            DeckCard.objects.filter(deck_id=deck.id)
            .aggregate(models.Max("sort_order"))
            .get("sort_order__max")
        )
        next_sort = int(max_sort) + 1 if max_sort is not None else 0

        added = 0
        already = 0
        not_found = 0

        for t in tokens:
            page = None
            if isinstance(t, str) and t.isdigit():
                page = MicroArticlePage.objects.filter(id=int(t)).first()
            if page is None and isinstance(t, str):
                slug = slugify(t)
                page = MicroArticlePage.objects.filter(slug=slug).first()
            if page is None:
                not_found += 1
                continue
            if page.id in existing_ids:
                already += 1
                continue

            obj = DeckCard(deck=deck, microarticle=page)
            obj.sort_order = next_sort
            next_sort += 1
            obj.save()
            existing_ids.add(page.id)
            added += 1

        return Response({"added": added, "already_present": already, "not_found": not_found})


class AdminPackRemoveCardView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pack_id: int, card_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = Deck.objects.filter(id=pack_id, type=Deck.DeckType.OFFICIAL).first()
        if deck is None:
            return Response(status=404)

        DeckCard.objects.filter(deck_id=deck.id, microarticle_id=card_id).delete()
        return Response({"ok": True})


class AdminPackReorderCardsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pack_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = Deck.objects.filter(id=pack_id, type=Deck.DeckType.OFFICIAL).first()
        if deck is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        order = payload.get("microarticle_ids")
        if not isinstance(order, list):
            raise DRFValidationError({"microarticle_ids": "microarticle_ids must be a list"})

        try:
            ids = [int(x) for x in order]
        except (TypeError, ValueError):
            raise DRFValidationError({"microarticle_ids": "microarticle_ids must be a list of integers"})

        cards = list(DeckCard.objects.filter(deck_id=deck.id, microarticle_id__in=ids))
        cards_by_mid = {c.microarticle_id: c for c in cards}

        missing = [mid for mid in ids if mid not in cards_by_mid]
        if missing:
            raise DRFValidationError({"microarticle_ids": "Some ids are not in this pack"})

        updated = []
        for idx, mid in enumerate(ids):
            c = cards_by_mid[mid]
            if c.sort_order != idx:
                c.sort_order = idx
                updated.append(c)

        if updated:
            DeckCard.objects.bulk_update(updated, ["sort_order"])

        return Response({"ok": True, "updated": len(updated)})


class CardDecksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, card_id: int):
        _get_or_create_default_deck(request.user)
        decks = list(Deck.objects.filter(user=request.user, type=Deck.DeckType.USER).order_by("sort_order", "id"))
        member_deck_ids = set(
            DeckCard.objects.filter(deck__user=request.user, microarticle_id=card_id).values_list(
                "deck_id", flat=True
            )
        )
        items = [
            {
                "id": d.id,
                "name": d.name,
                "is_default": bool(d.is_default),
                "is_member": d.id in member_deck_ids,
            }
            for d in decks
        ]
        return Response(items)

    def put(self, request, card_id: int):
        deck_ids = request.data.get("deck_ids") if isinstance(request.data, dict) else None
        if not isinstance(deck_ids, list):
            raise DRFValidationError({"deck_ids": "deck_ids must be a list"})

        normalized: list[int] = []
        for d in deck_ids:
            try:
                normalized.append(int(d))
            except (TypeError, ValueError):
                raise DRFValidationError({"deck_ids": "deck_ids must contain integers"})

        allowed_decks = Deck.objects.filter(user=request.user, type=Deck.DeckType.USER, id__in=normalized)
        allowed_ids = set(allowed_decks.values_list("id", flat=True))

        DeckCard.objects.filter(deck__user=request.user, microarticle_id=card_id).exclude(
            deck_id__in=list(allowed_ids)
        ).delete()

        existing = set(
            DeckCard.objects.filter(deck__user=request.user, microarticle_id=card_id).values_list(
                "deck_id", flat=True
            )
        )
        for deck_id in allowed_ids - existing:
            DeckCard.objects.get_or_create(deck_id=deck_id, microarticle_id=card_id)

        return Response({"ok": True, "deck_ids": list(allowed_ids)})


class MicroArticleReadStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        slugs_param = request.query_params.get("slugs")
        if not slugs_param or not isinstance(slugs_param, str):
            raise DRFValidationError({"slugs": "slugs is required (comma-separated)"})

        slugs = [s.strip() for s in slugs_param.split(",") if s.strip()]
        if not slugs:
            return Response({"items": {}})

        pages = MicroArticlePage.objects.live().public().filter(slug__in=slugs)
        slug_by_id = {p.id: p.slug for p in pages}
        if not slug_by_id:
            return Response({"items": {}})

        rows = MicroArticleReadState.objects.filter(
            user=request.user,
            microarticle_id__in=list(slug_by_id.keys()),
        ).values_list("microarticle_id", "is_read")

        items = {slug_by_id[mid]: bool(is_read) for (mid, is_read) in rows if mid in slug_by_id}
        # Default to false for missing state
        for slug in slugs:
            if slug not in items:
                items[slug] = False

        return Response({"items": items})

    def post(self, request):
        slug = request.data.get("slug") if isinstance(request.data, dict) else None
        is_read = request.data.get("is_read") if isinstance(request.data, dict) else None
        if not slug or not isinstance(slug, str):
            raise DRFValidationError({"slug": "slug is required"})
        if not isinstance(is_read, bool):
            raise DRFValidationError({"is_read": "is_read must be a boolean"})

        page = (
            MicroArticlePage.objects.live()
            .public()
            .filter(slug=slug)
            .specific()
            .first()
        )
        if page is None:
            raise DRFValidationError({"slug": "Unknown microarticle"})

        obj, _ = MicroArticleReadState.objects.get_or_create(
            user=request.user,
            microarticle_id=page.id,
            defaults={"is_read": is_read},
        )
        if obj.is_read != is_read:
            obj.is_read = is_read
            obj.save(update_fields=["is_read", "updated_at"])

        return Response({"slug": page.slug, "is_read": bool(obj.is_read)})


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
