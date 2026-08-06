"""Back-office des packs officiels : CRUD, recherche de fiches, upload d'images."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.db.models import Q
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from wagtail.images import get_image_model
from wagtail.images.fields import WagtailImageField
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

        upload = request.FILES.get("file") or request.FILES.get("image")
        if upload is None:
            raise DRFValidationError({"file": "file is required"})

        # This view bypasses the Wagtail form, so replay its validation here:
        # WagtailImageField checks the extension against WAGTAILIMAGES_EXTENSIONS,
        # that the real file format matches that extension, the file size
        # (WAGTAILIMAGES_MAX_UPLOAD_SIZE) and the pixel count.
        try:
            upload = WagtailImageField(required=True).clean(upload)
        except DjangoValidationError as exc:
            raise DRFValidationError({"file": list(exc.messages)}) from exc

        title = request.data.get("title") if hasattr(request, "data") else None
        if not isinstance(title, str) or not title.strip():
            title = getattr(upload, "name", "cover")

        ImageModel = get_image_model()
        try:
            collection = Collection.get_first_root_node()
        except Exception:
            collection = None

        image = ImageModel(title=title.strip(), file=upload)
        if collection is not None and hasattr(image, "collection_id"):
            image.collection = collection
        image.save()

        return Response(_image_payload(image), status=201)


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
