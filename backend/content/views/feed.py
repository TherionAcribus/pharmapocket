"""Feed public : landing, liste/détail des fiches, sauvegardes, état de lecture."""

import logging

from django.db.models import Q
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..html import sanitize_rich_text
from ..models import (
    Deck,
    DeckCard,
    LandingPage,
    MicroArticlePage,
    MicroArticleReadState,
    Source,
)
from ..pagination import MicroArticleCursorPagination
from ..search import filter_microarticles
from ..serializers import (
    MicroArticleCardSerializer,
    MicroArticleDetailSerializer,
    MicroArticleListSerializer,
)
from ..serializers.inputs import (
    MicroArticleReadStateSerializer,
    SavedMicroArticleCreateSerializer,
)
from .helpers import (
    _apply_tree_filter,
    _get_or_create_default_deck,
    _get_subject_for_card,
    _parse_int,
    _reference_payload,
    _sanitize_stream_value,
    _stream_items,
    _subject_detail_cards,
    _subject_payload,
    _subject_recap_card,
)

logger = logging.getLogger(__name__)


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

        # Recherche lancée à la validation du formulaire (pas de frappe en cours) :
        # `search()` plein mot, pas `autocomplete()`. Le tri reste antéchronologique,
        # imposé par la pagination curseur.
        qs = filter_microarticles(qs, self.request.query_params.get("q"))

        tags = self.request.query_params.get("tags")
        if tags:
            tag_slugs = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_slugs:
                invalid = [t for t in tag_slugs if slugify(t) != t]
                if invalid:
                    raise DRFValidationError(
                        {
                            "tags": ["tags must be a comma-separated list of slugs."],
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
        list_fields = (
            *MicroArticleCardSerializer.default_fields,
            "tags_payload",
            "categories_theme_payload",
            "categories_maladies_payload",
            "categories_medicament_payload",
            "categories_pharmacologie_payload",
        )
        data = [
            {
                **MicroArticleCardSerializer(p, fields=list_fields).data,
                "card_type": p.card_type,
            }
            for p in page
        ]
        serializer = self.get_serializer(data, many=True)
        return self.get_paginated_response(serializer.data)


class MicroArticleDetailView(RetrieveAPIView):
    serializer_class = MicroArticleDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        logger.debug("[MicroArticleDetailView] slug=%s", self.kwargs["slug"])
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

        logger.debug(
            "[MicroArticleDetailView] slug=%s answer_detail_len=%s sources_len=%s see_more_len=%s links_len=%s",
            page.slug,
            len((page.answer_detail or "").strip()),
            len(page.sources or []),
            len(page.see_more or []),
            len(page.links or []),
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
            see_more_blocks = [
                {"type": "detail", "value": sanitize_rich_text(page.answer_detail)}
            ] + see_more_blocks
        if page.sources:
            refs = []
            for b in page.sources:
                try:
                    refs.append(_reference_payload(b.value))
                except Exception:
                    continue
            if refs:
                see_more_blocks = see_more_blocks + [{"type": "references", "value": refs}]

        # Get subject info if card belongs to a subject
        subject = _get_subject_for_card(page)
        subject_data = _subject_payload(subject)
        detail_cards = _subject_detail_cards(subject) if subject else []
        recap_card = _subject_recap_card(subject) if subject else None

        card_payload = MicroArticleCardSerializer(
            page,
            fields=(
                *MicroArticleCardSerializer.default_fields,
                "tags_payload",
                "categories_theme_payload",
                "categories_maladies_payload",
                "categories_medicament_payload",
                "categories_pharmacologie_payload",
                "questions",
                "recap_points",
                "parent_recap_cards",
            ),
        ).data
        data = {
            **card_payload,
            "links": links_blocks,
            "see_more": see_more_blocks,
            "categories_theme": [item["name"] for item in card_payload["categories_theme_payload"]],
            "categories_maladies": [item["name"] for item in card_payload["categories_maladies_payload"]],
            "categories_medicament": [item["name"] for item in card_payload["categories_medicament_payload"]],
            "categories_pharmacologie": [
                item["name"] for item in card_payload["categories_pharmacologie_payload"]
            ],
            "card_type": page.card_type,
            "subject": subject_data,
            "detail_cards": detail_cards,
            "recap_card": recap_card,
            "recap_points": card_payload["recap_points"] if page.card_type == "recap" else [],
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
            DeckCard.objects.filter(
                deck=default_deck,
                microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
            )
            .select_related("microarticle", "microarticle__cover_image")
            .prefetch_related("microarticle__tags")
            .order_by("-added_at")
        )

        items = [MicroArticleCardSerializer(r.microarticle).data for r in rows]
        return Response(items)

    def post(self, request):
        serializer = SavedMicroArticleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = serializer.validated_data["page"]

        default_deck = _get_or_create_default_deck(request.user)
        DeckCard.objects.get_or_create(deck=default_deck, microarticle=page)
        return Response({"saved": True})


class SavedMicroArticleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug: str):
        page = MicroArticlePage.objects.live().public().filter(slug=slug).first()
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
        page = MicroArticlePage.objects.live().public().filter(slug=slug).first()
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


class MicroArticleReadStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        slugs_param = request.query_params.get("slugs")
        if not slugs_param or not isinstance(slugs_param, str):
            raise DRFValidationError({"slugs": ["slugs is required (comma-separated)"]})

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
        serializer = MicroArticleReadStateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = serializer.validated_data["page"]
        is_read = serializer.validated_data["is_read"]

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
