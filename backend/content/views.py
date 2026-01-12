from datetime import date, datetime
import logging

from django.db import models
from django.db.models import Q
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from wagtail.documents.models import Document
from wagtail.images import get_image_model

from .models import (
    CategoryMedicament,
    CategoryMaladies,
    CategoryTheme,
    Deck,
    DeckCard,
    MicroArticlePage,
    MicroArticleReadState,
    Source,
)
from .pagination import MicroArticleCursorPagination
from .serializers import MicroArticleDetailSerializer, MicroArticleListSerializer

logger = logging.getLogger(__name__)


def _get_or_create_default_deck(user) -> Deck:
    deck = Deck.objects.filter(user=user, is_default=True).first()
    if deck is not None:
        return deck

    Deck.objects.filter(user=user, is_default=True).update(is_default=False)
    existing = Deck.objects.filter(user=user, name="Mes cartes").first()
    if existing is not None:
        existing.is_default = True
        existing.sort_order = 0
        existing.save(update_fields=["is_default", "sort_order", "updated_at"])
        return existing

    return Deck.objects.create(user=user, name="Mes cartes", is_default=True, sort_order=0)


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
        "credit_license": getattr(image, "credit_license", "") or "",
        "credit_license_url": getattr(image, "credit_license_url", "") or "",
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
            "cover_image_credit": _cover_credit(page),
            "cover_image": _cover_payload(page),
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
            default_deck = Deck.objects.filter(user=request.user, is_default=True).first()
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
        default_deck = Deck.objects.filter(user=request.user, is_default=True).first()
        if default_deck is None:
            return Response({"saved": False})
        return Response(
            {"saved": DeckCard.objects.filter(deck=default_deck, microarticle_id=page.id).exists()}
        )

    def delete(self, request, slug: str):
        page = MicroArticlePage.objects.filter(slug=slug).first()
        if page is None:
            return Response(status=204)
        default_deck = Deck.objects.filter(user=request.user, is_default=True).first()
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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _get_or_create_default_deck(request.user)

        qs = (
            Deck.objects.filter(user=request.user)
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
            Deck.objects.filter(user=request.user).aggregate(models.Max("sort_order")).get("sort_order__max")
            or 0
        )
        deck = Deck.objects.create(user=request.user, name=name, sort_order=int(sort_order) + 1)
        return Response({"id": deck.id, "name": deck.name, "is_default": bool(deck.is_default), "sort_order": deck.sort_order})


class DeckDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user).first()
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
        deck = Deck.objects.filter(id=deck_id, user=request.user).first()
        if deck is None:
            return Response(status=404)
        if deck.is_default:
            raise DRFValidationError({"detail": "Default deck cannot be deleted"})
        deck.delete()
        return Response(status=204)


class DeckSetDefaultView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user).first()
        if deck is None:
            return Response(status=404)

        Deck.objects.filter(user=request.user, is_default=True).exclude(id=deck.id).update(is_default=False)
        if not deck.is_default:
            deck.is_default = True
            deck.save(update_fields=["is_default", "updated_at"])
        return Response({"ok": True, "default_deck_id": deck.id})


class DeckCardsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user).first()
        if deck is None:
            return Response(status=404)

        search = request.query_params.get("search")
        qs = (
            DeckCard.objects.filter(deck=deck)
            .select_related("microarticle", "microarticle__cover_image")
            .order_by("-added_at")
        )
        if search and isinstance(search, str) and search.strip():
            s = search.strip()
            qs = qs.filter(
                Q(microarticle__title__icontains=s) | Q(microarticle__answer_express__icontains=s)
            )
        card_ids = list(qs.values_list("microarticle_id", flat=True))
        deck_counts_by_card_id = {
            row["microarticle_id"]: row["decks_count"]
            for row in DeckCard.objects.filter(
                deck__user=request.user,
                microarticle_id__in=card_ids,
            )
            .values("microarticle_id")
            .annotate(decks_count=models.Count("deck_id", distinct=True))
        }

        items: list[dict] = []
        for r in qs:
            item = _microarticle_list_item(r.microarticle)
            item["decks_count"] = int(deck_counts_by_card_id.get(r.microarticle_id, 1))
            items.append(item)
        return Response({"count": len(items), "results": items})

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user).first()
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


class DeckCardDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, deck_id: int, card_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user).first()
        if deck is None:
            return Response(status=404)
        DeckCard.objects.filter(deck=deck, microarticle_id=card_id).delete()
        return Response(status=204)


class CardDecksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, card_id: int):
        _get_or_create_default_deck(request.user)
        decks = list(Deck.objects.filter(user=request.user).order_by("sort_order", "id"))
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

        allowed_decks = Deck.objects.filter(user=request.user, id__in=normalized)
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
