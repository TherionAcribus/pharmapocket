"""Back-office des packs officiels : CRUD, recherche de fiches, upload d'images."""

from django.db import models
from django.db.models import Q
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from wagtail.images import get_image_model
from wagtail.models import Collection

from ..models import (
    CategoryMedicament,
    CategoryMaladies,
    CategoryPharmacologie,
    CategoryTheme,
    Deck,
    DeckCard,
    MicroArticlePage,
)
from ..search import filter_microarticles
from ..serializers.inputs import (
    AdminImageUploadSerializer,
    AdminPackBulkAddSerializer,
    AdminPackCreateSerializer,
    AdminPackPatchSerializer,
    AdminPackReorderSerializer,
)
from .helpers import _image_payload, _microarticle_list_item, _require_staff


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

        serializer = AdminPackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sort_order = data.get("sort_order")
        if sort_order is None:
            sort_order = (
                Deck.objects.filter(type=Deck.DeckType.OFFICIAL)
                .aggregate(models.Max("sort_order"))
                .get("sort_order__max")
            )
            sort_order = int(sort_order) + 1 if sort_order is not None else 0

        deck = Deck.objects.create(
            type=Deck.DeckType.OFFICIAL,
            status=data.get("status") or Deck.Status.DRAFT,
            user=None,
            name=data["name"],
            description=data.get("description", ""),
            difficulty=data.get("difficulty", ""),
            estimated_minutes=data.get("estimated_minutes"),
            cover_image_id=data.get("cover_image_id"),
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
            .prefetch_related("microarticle__tags")
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

        serializer = AdminPackPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        update_fields = ["updated_at"]
        for field, value in serializer.validated_data.items():
            setattr(deck, field, value)
            # `cover_image_id` s'écrit via la colonne, mais `update_fields` attend
            # le nom du champ du modèle.
            update_fields.append("cover_image" if field == "cover_image_id" else field)

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

        def _parse_csv_ints(value: str | None) -> list[int]:
            if not value:
                return []
            out: list[int] = []
            for part in value.split(","):
                part = part.strip()
                if not part:
                    continue
                try:
                    out.append(int(part))
                except ValueError:
                    continue
            return out

        def _parse_csv_strings(value: str | None) -> list[str]:
            if not value:
                return []
            return [p.strip() for p in value.split(",") if p and p.strip()]

        q = request.query_params.get("q")
        s = q.strip() if isinstance(q, str) else ""

        recent_raw = request.query_params.get("recent")
        recent = str(recent_raw).strip().lower() in ("1", "true", "yes")

        theme_nodes = _parse_csv_ints(
            request.query_params.get("theme_nodes") or request.query_params.get("theme_node")
        )
        theme_scope = request.query_params.get("theme_scope") or "subtree"

        medicament_nodes = _parse_csv_ints(
            request.query_params.get("medicament_nodes") or request.query_params.get("medicament_node")
        )
        medicament_scope = request.query_params.get("medicament_scope") or "subtree"

        maladies_nodes = _parse_csv_ints(
            request.query_params.get("maladies_nodes") or request.query_params.get("maladies_node")
        )
        maladies_scope = request.query_params.get("maladies_scope") or "subtree"

        pharmacologie_nodes = _parse_csv_ints(
            request.query_params.get("pharmacologie_nodes") or request.query_params.get("pharmacologie_node")
        )
        pharmacologie_scope = request.query_params.get("pharmacologie_scope") or "subtree"

        tags = _parse_csv_strings(request.query_params.get("tags"))

        has_filters = bool(theme_nodes or medicament_nodes or pharmacologie_nodes or maladies_nodes or tags or recent)
        if not s and not has_filters:
            return Response([])

        qs = MicroArticlePage.objects.live().public().all()
        # Sélecteur de fiches du back-office : la requête arrive au fil de la frappe,
        # d'où `autocomplete()` (dernier terme traité comme préfixe, sur title + slug).
        qs = filter_microarticles(
            qs,
            s,
            autocomplete=True,
            fallback_fields=("title", "answer_express", "slug"),
        )

        def _apply_taxonomy_filter(qs_in, *, model, rel: str, node_ids: list[int], scope: str):
            if not node_ids:
                return qs_in
            scope = scope if scope in ("exact", "subtree") else "subtree"
            if scope == "exact":
                return qs_in.filter(**{f"{rel}__id__in": node_ids})

            nodes = list(model.objects.filter(id__in=node_ids))
            if not nodes:
                return qs_in
            q_or = Q()
            for n in nodes:
                q_or |= Q(**{f"{rel}__path__startswith": n.path})
            return qs_in.filter(q_or)

        qs = _apply_taxonomy_filter(
            qs,
            model=CategoryTheme,
            rel="categories_theme",
            node_ids=theme_nodes,
            scope=theme_scope,
        )
        qs = _apply_taxonomy_filter(
            qs,
            model=CategoryMaladies,
            rel="categories_maladies",
            node_ids=maladies_nodes,
            scope=maladies_scope,
        )
        qs = _apply_taxonomy_filter(
            qs,
            model=CategoryMedicament,
            rel="categories_medicament",
            node_ids=medicament_nodes,
            scope=medicament_scope,
        )
        qs = _apply_taxonomy_filter(
            qs,
            model=CategoryPharmacologie,
            rel="categories_pharmacologie",
            node_ids=pharmacologie_nodes,
            scope=pharmacologie_scope,
        )
        if tags:
            qs = qs.filter(tags__slug__in=tags)

        if recent:
            qs = qs.order_by("-first_published_at", "-id")
        else:
            qs = qs.order_by("title")

        qs = qs.distinct().specific()

        results = list(qs[:30])
        ids = [p.id for p in results]

        packs_count_by_id: dict[int, int] = {}
        if ids:
            packs_count_by_id = {
                row["microarticle_id"]: int(row["packs_count"])
                for row in DeckCard.objects.filter(
                    deck__type=Deck.DeckType.OFFICIAL,
                    microarticle_id__in=ids,
                )
                .values("microarticle_id")
                .annotate(packs_count=models.Count("deck_id", distinct=True))
            }

        rows = []
        for p in results:
            rows.append(
                {
                    "id": p.id,
                    "slug": p.slug,
                    "title": p.title,
                    "packs_count": int(packs_count_by_id.get(p.id, 0)),
                }
            )
        return Response(rows)


class AdminImageUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        # La vue court-circuite le formulaire Wagtail : `AdminImageUploadSerializer`
        # rejoue sa validation (extension, format réel, taille, nombre de pixels).
        serializer = AdminImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]
        title = serializer.validated_data["title"]

        ImageModel = get_image_model()
        try:
            collection = Collection.get_first_root_node()
        except Exception:
            collection = None

        image = ImageModel(title=title, file=upload)
        if collection is not None and hasattr(image, "collection_id"):
            image.collection = collection
        image.save()

        return Response(_image_payload(image), status=201)


class AdminPackBulkAddView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pack_id: int):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        deck = Deck.objects.filter(id=pack_id, type=Deck.DeckType.OFFICIAL).first()
        if deck is None:
            return Response(status=404)

        serializer = AdminPackBulkAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens: list[str] = serializer.validated_data["tokens"]

        existing_ids = set(
            DeckCard.objects.filter(deck_id=deck.id).values_list("microarticle_id", flat=True)
        )

        max_sort = (
            DeckCard.objects.filter(deck_id=deck.id)
            .aggregate(models.Max("sort_order"))
            .get("sort_order__max")
        )
        next_sort = int(max_sort) + 1 if max_sort is not None else 0

        # Résolution en 2 requêtes (ids puis slugs) au lieu d'un lookup par token.
        wanted_ids = {int(t) for t in tokens if isinstance(t, str) and t.isdigit()}
        wanted_slugs = {slugify(t) for t in tokens if isinstance(t, str)}

        pages_by_id = {}
        if wanted_ids:
            pages_by_id = MicroArticlePage.objects.in_bulk(wanted_ids)

        pages_by_slug = {}
        if wanted_slugs:
            pages_by_slug = {
                p.slug: p for p in MicroArticlePage.objects.filter(slug__in=wanted_slugs)
            }

        added = 0
        already = 0
        not_found = 0
        to_create = []

        for t in tokens:
            page = None
            if isinstance(t, str) and t.isdigit():
                page = pages_by_id.get(int(t))
            if page is None and isinstance(t, str):
                page = pages_by_slug.get(slugify(t))
            if page is None:
                not_found += 1
                continue
            if page.id in existing_ids:
                already += 1
                continue

            obj = DeckCard(deck=deck, microarticle=page)
            obj.sort_order = next_sort
            next_sort += 1
            to_create.append(obj)
            existing_ids.add(page.id)
            added += 1

        if to_create:
            DeckCard.objects.bulk_create(to_create)

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

        serializer = AdminPackReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["microarticle_ids"]

        cards = list(DeckCard.objects.filter(deck_id=deck.id, microarticle_id__in=ids))
        cards_by_mid = {c.microarticle_id: c for c in cards}

        missing = [mid for mid in ids if mid not in cards_by_mid]
        if missing:
            raise DRFValidationError({"microarticle_ids": ["Some ids are not in this pack"]})

        updated = []
        for idx, mid in enumerate(ids):
            c = cards_by_mid[mid]
            if c.sort_order != idx:
                c.sort_order = idx
                updated.append(c)

        if updated:
            DeckCard.objects.bulk_update(updated, ["sort_order"])

        return Response({"ok": True, "updated": len(updated)})
