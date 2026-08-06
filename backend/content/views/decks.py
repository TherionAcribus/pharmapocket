"""Decks utilisateur et packs officiels côté lecteur : CRUD, cartes, progression."""

from django.db import models
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Deck, DeckCard, MicroArticlePage, UserDeckProgress
from ..serializers import MicroArticleCardSerializer, image_payload
from ..serializers.inputs import (
    CardDecksUpdateSerializer,
    DeckCardAddSerializer,
    DeckCardsBulkAddSerializer,
    DeckCreateSerializer,
    DeckPatchSerializer,
    OfficialDeckProgressSerializer,
)
from .helpers import (
    _get_or_create_default_deck,
)

_UNSET_POSITION = object()


def _last_card_position(deck_id: int, card_id: int | None) -> int | None:
    """sort_order de `card_id` dans le deck, ou None si absente."""
    if not card_id:
        return None
    pos = (
        DeckCard.objects.filter(deck_id=deck_id, microarticle_id=card_id)
        .values_list("sort_order", flat=True)
        .first()
    )
    return int(pos) if pos is not None else None


def build_progress_payload(
    progress: UserDeckProgress | None,
    deck_id: int,
    cards_count: int,
    *,
    last_card_position=_UNSET_POSITION,
) -> dict | None:
    """Payload de progression d'un deck officiel, identique sur tous les écrans.

    `cards_seen_count` est rattrapé depuis `last_card_id` quand il vaut 0 (progression
    enregistrée avant l'introduction du compteur). Les appels en lot passent
    `last_card_position` déjà résolu pour éviter une requête par deck.
    """
    if progress is None:
        return None

    done = int(getattr(progress, "cards_done_count", 0) or 0)
    seen = int(getattr(progress, "cards_seen_count", 0) or 0)
    if seen == 0 and getattr(progress, "last_card_id", None):
        pos = (
            _last_card_position(deck_id, progress.last_card_id)
            if last_card_position is _UNSET_POSITION
            else last_card_position
        )
        if pos is not None:
            seen = max(seen, int(pos) + 1)

    effective = max(done, seen)
    progress_pct = int(round((effective / cards_count) * 100)) if cards_count else 0
    return {
        "started_at": progress.started_at,
        "last_seen_at": progress.last_seen_at,
        "cards_seen_count": seen,
        "cards_done_count": done,
        "progress_pct": progress_pct,
        "mode_last": progress.mode_last,
        "last_card_id": progress.last_card_id,
    }


class DeckListSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()
    sort_order = serializers.IntegerField()
    cards_count = serializers.IntegerField()
    source_pack_id = serializers.IntegerField(allow_null=True)


class DeckListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            req_type = self.request.query_params.get("type")
            if req_type == Deck.DeckType.OFFICIAL:
                return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        req_type = request.query_params.get("type")
        public_card_ids = MicroArticlePage.objects.live().public().values_list("id", flat=True)
        if req_type == Deck.DeckType.OFFICIAL:
            qs = (
                Deck.objects.filter(type=Deck.DeckType.OFFICIAL, status=Deck.Status.PUBLISHED)
                .select_related("cover_image")
                .order_by("sort_order", "id")
                .annotate(
                    cards_count=models.Count(
                        "deck_cards",
                        filter=Q(deck_cards__microarticle_id__in=public_card_ids),
                    )
                )
            )

            progress_by_deck_id: dict[int, UserDeckProgress] = {}
            if request.user.is_authenticated:
                progress_rows = UserDeckProgress.objects.filter(
                    user=request.user,
                    deck_id__in=list(qs.values_list("id", flat=True)),
                )
                progress_by_deck_id = {p.deck_id: p for p in progress_rows}

            last_card_by_deck_id = {
                p.deck_id: p.last_card_id
                for p in progress_by_deck_id.values()
                if getattr(p, "last_card_id", None)
            }
            last_positions_by_deck_id: dict[int, int] = {}
            if last_card_by_deck_id:
                deck_ids = list(last_card_by_deck_id.keys())
                card_ids = list({cid for cid in last_card_by_deck_id.values() if cid})
                rows = DeckCard.objects.filter(
                    deck_id__in=deck_ids,
                    microarticle_id__in=card_ids,
                ).filter(microarticle_id__in=public_card_ids).values(
                    "deck_id", "microarticle_id", "sort_order"
                )
                for r in rows:
                    did = int(r["deck_id"])
                    if last_card_by_deck_id.get(did) == int(r["microarticle_id"]):
                        last_positions_by_deck_id[did] = int(r["sort_order"])

            items: list[dict] = []
            for d in qs:
                p = progress_by_deck_id.get(d.id)
                cards_count = int(getattr(d, "cards_count", 0) or 0)
                progress_payload = build_progress_payload(
                    p,
                    d.id,
                    cards_count,
                    last_card_position=last_positions_by_deck_id.get(d.id),
                )
                cover_payload = image_payload(d.cover_image) if getattr(d, "cover_image_id", None) else None
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
                        "progress": progress_payload,
                    }
                )
            return Response(items)

        _get_or_create_default_deck(request.user)

        qs = (
            Deck.objects.filter(user=request.user, type=Deck.DeckType.USER)
            .order_by("sort_order", "id")
            .annotate(
                cards_count=models.Count(
                    "deck_cards",
                    filter=Q(deck_cards__microarticle_id__in=public_card_ids),
                )
            )
        )
        items = [
            {
                "id": d.id,
                "name": d.name,
                "is_default": bool(d.is_default),
                "sort_order": int(d.sort_order),
                "cards_count": int(getattr(d, "cards_count", 0) or 0),
                "source_pack_id": d.source_pack_id,
            }
            for d in qs
        ]
        serializer = DeckListSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = DeckCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

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
            name=serializer.validated_data["name"],
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

        cards_qs = (
            DeckCard.objects.filter(
                deck=deck,
                microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
            )
            .select_related("microarticle", "microarticle__cover_image")
            .prefetch_related("microarticle__tags")
        )
        if deck.type == Deck.DeckType.OFFICIAL or getattr(deck, "source_pack_id", None):
            cards_qs = cards_qs.order_by("sort_order", "id")
        else:
            cards_qs = cards_qs.order_by("-added_at")

        cards = []
        for r in cards_qs:
            item = dict(MicroArticleCardSerializer(r.microarticle).data)
            item["position"] = r.sort_order
            item["sort_order"] = r.sort_order
            item["is_optional"] = bool(r.is_optional)
            item["notes"] = r.notes
            cards.append(item)

        deck_cover_payload = image_payload(deck.cover_image) if getattr(deck, "cover_image_id", None) else None

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
            "source_pack_id": getattr(deck, "source_pack_id", None),
            "cards_count": len(cards),
            "cards": cards,
        }

        if request.user.is_authenticated and deck.type == Deck.DeckType.OFFICIAL:
            progress = UserDeckProgress.objects.filter(user=request.user, deck=deck).first()
            payload["progress"] = build_progress_payload(progress, deck.id, len(cards))

        return Response(payload)

    def patch(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)

        serializer = DeckPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(deck, field, value)
        deck.save(update_fields=[*serializer.validated_data, "updated_at"])
        return Response({"id": deck.id, "name": deck.name, "is_default": bool(deck.is_default), "sort_order": deck.sort_order})

    def delete(self, request, deck_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)
        if deck.is_default:
            raise DRFValidationError({"detail": ["Default deck cannot be deleted"]})
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
            DeckCard.objects.filter(
                deck=deck,
                microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
            )
            .select_related("microarticle", "microarticle__cover_image")
            .prefetch_related("microarticle__tags")
        )
        if deck.type == Deck.DeckType.OFFICIAL or getattr(deck, "source_pack_id", None):
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
            item = dict(MicroArticleCardSerializer(r.microarticle).data)
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

        serializer = DeckCardAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        microarticle_id = serializer.validated_data["card"].pk

        obj, created = DeckCard.objects.get_or_create(deck=deck, microarticle_id=microarticle_id)
        if created and getattr(deck, "source_pack_id", None):
            max_sort = (
                DeckCard.objects.filter(deck_id=deck.id)
                .exclude(id=obj.id)
                .aggregate(models.Max("sort_order"))
                .get("sort_order__max")
            )
            obj.sort_order = int(max_sort) + 1 if max_sort is not None else 0
            obj.save(update_fields=["sort_order"])
        return Response({"ok": True})


class DeckCardsBulkAddView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, deck_id: int):
        deck = Deck.objects.filter(
            id=deck_id,
            user=request.user,
            type=Deck.DeckType.USER,
        ).first()
        if deck is None:
            return Response(status=404)

        serializer = DeckCardsBulkAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        micro_ids = serializer.validated_data["card_ids"]
        if not micro_ids:
            return Response({"added": 0, "already_present": 0})

        public_ids = set(
            MicroArticlePage.objects.live()
            .public()
            .filter(id__in=micro_ids)
            .values_list("id", flat=True)
        )
        if len(public_ids) != len(micro_ids):
            raise DRFValidationError({"card_ids": ["Contains an unknown or unavailable card"]})

        existing = set(
            DeckCard.objects.filter(deck_id=deck.id, microarticle_id__in=micro_ids).values_list(
                "microarticle_id", flat=True
            )
        )

        to_add = [mid for mid in micro_ids if mid not in existing]
        if not to_add:
            return Response({"added": 0, "already_present": len(existing)})

        max_sort = (
            DeckCard.objects.filter(deck_id=deck.id)
            .aggregate(models.Max("sort_order"))
            .get("sort_order__max")
        )
        next_sort = int(max_sort) + 1 if max_sort is not None else 0

        objs = []
        for mid in to_add:
            obj = DeckCard(deck=deck, microarticle_id=mid)
            if getattr(deck, "source_pack_id", None):
                obj.sort_order = next_sort
                next_sort += 1
            objs.append(obj)

        DeckCard.objects.bulk_create(objs)
        return Response({"added": len(objs), "already_present": len(existing)})


class OfficialDeckCopyToUserView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, deck_id: int):
        pack = Deck.objects.filter(
            id=deck_id,
            type=Deck.DeckType.OFFICIAL,
            status=Deck.Status.PUBLISHED,
        ).first()
        if pack is None:
            return Response(status=404)

        _get_or_create_default_deck(request.user)
        sort_order = (
            Deck.objects.filter(user=request.user, type=Deck.DeckType.USER)
            .aggregate(models.Max("sort_order"))
            .get("sort_order__max")
            or 0
        )

        desired = pack.name.strip() if isinstance(pack.name, str) else "Pack"
        base_name = desired or "Pack"
        name = base_name
        idx = 2
        while Deck.objects.filter(user=request.user, type=Deck.DeckType.USER, name=name).exists():
            name = f"{base_name} ({idx})"
            idx += 1

        deck = Deck.objects.create(
            user=request.user,
            type=Deck.DeckType.USER,
            name=name,
            sort_order=int(sort_order) + 1,
            source_pack=pack,
        )

        cards_qs = DeckCard.objects.filter(
            deck=pack,
            microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
        ).order_by("sort_order", "id")
        objs = []
        for i, c in enumerate(cards_qs):
            objs.append(DeckCard(deck=deck, microarticle_id=c.microarticle_id, sort_order=i))
        if objs:
            DeckCard.objects.bulk_create(objs)

        return Response({"deck_id": deck.id})


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

        cards_count = DeckCard.objects.filter(
            deck_id=deck.id,
            microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
        ).count()
        return Response(
            {"deck_id": deck.id, **build_progress_payload(obj, deck.id, cards_count)}
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

        serializer = OfficialDeckProgressSerializer(data=request.data, context={"deck": deck})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        mode_last = data.get("mode_last")
        last_card_id = data.get("last_card_id")
        cards_seen_count = data.get("cards_seen_count")
        cards_done_count = data.get("cards_done_count")

        update_fields: list[str] = ["last_seen_at"]

        obj, _ = UserDeckProgress.objects.get_or_create(
            user=request.user,
            deck=deck,
        )
        obj.last_seen_at = timezone.now()

        if mode_last is not None:
            obj.mode_last = mode_last
            update_fields.append("mode_last")

        if last_card_id is not None:
            obj.last_card_id = last_card_id
            update_fields.append("last_card")

        if obj.last_card_id is not None and cards_seen_count is None:
            pos = DeckCard.objects.filter(
                deck_id=deck.id,
                microarticle_id=obj.last_card_id,
            ).values_list("sort_order", flat=True).first()
            if pos is not None:
                next_seen = max(int(obj.cards_seen_count or 0), int(pos) + 1)
                if next_seen != obj.cards_seen_count:
                    obj.cards_seen_count = next_seen
                    update_fields.append("cards_seen_count")

        if cards_seen_count is not None:
            obj.cards_seen_count = cards_seen_count
            update_fields.append("cards_seen_count")

        if cards_done_count is not None:
            obj.cards_done_count = cards_done_count
            update_fields.append("cards_done_count")

        # Always persist last_seen_at
        obj.save(update_fields=list(dict.fromkeys(update_fields)))

        cards_count = DeckCard.objects.filter(
            deck_id=deck.id,
            microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
        ).count()

        return Response(
            {"deck_id": deck.id, **build_progress_payload(obj, deck.id, cards_count)}
        )


class DeckCardDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, deck_id: int, card_id: int):
        deck = Deck.objects.filter(id=deck_id, user=request.user, type=Deck.DeckType.USER).first()
        if deck is None:
            return Response(status=404)
        DeckCard.objects.filter(deck=deck, microarticle_id=card_id).delete()
        return Response(status=204)


class CardDecksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, card_id: int):
        if not MicroArticlePage.objects.live().public().filter(id=card_id).exists():
            return Response(status=404)
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
        if not MicroArticlePage.objects.live().public().filter(id=card_id).exists():
            return Response(status=404)
        serializer = CardDecksUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        normalized = serializer.validated_data["deck_ids"]

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
