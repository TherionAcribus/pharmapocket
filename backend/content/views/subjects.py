"""API des sujets : liste/détail publics, gestion des cartes réservée au staff."""

from django.db import models
from django.db.models import Count, Exists, OuterRef, Q
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CardType, MicroArticlePage, Subject, SubjectCard
from .helpers import _require_staff, _subject_detail_cards, _subject_recap_card


class SubjectListCreateView(APIView):
    """List all subjects or create a new one (admin only)."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        qs = (
            Subject.objects.all()
            .annotate(
                cards_count=Count("subject_cards", distinct=True),
                has_recap=Exists(
                    SubjectCard.objects.filter(
                        subject=OuterRef("pk"),
                        microarticle__card_type=CardType.RECAP,
                    )
                ),
            )
            .order_by("name")
        )

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q))

        items = [
            {
                "id": s.id,
                "name": s.name,
                "slug": s.slug,
                "description": s.description,
                "cards_count": s.cards_count,
                "has_recap": s.has_recap,
            }
            for s in qs[:100]
        ]
        return Response(items)

    def post(self, request):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        payload = request.data if isinstance(request.data, dict) else {}
        name = payload.get("name")
        if not name or not isinstance(name, str) or not name.strip():
            raise DRFValidationError({"name": "name is required"})

        slug = payload.get("slug")
        if slug:
            slug = slugify(slug)
        else:
            slug = slugify(name)

        if Subject.objects.filter(slug=slug).exists():
            raise DRFValidationError({"slug": "slug already exists"})

        subject = Subject.objects.create(
            name=name.strip(),
            slug=slug,
            description=payload.get("description", ""),
        )
        return Response(
            {
                "id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "description": subject.description,
            },
            status=201,
        )


class SubjectDetailView(APIView):
    """Get, update or delete a subject (admin only for write operations)."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, slug: str):
        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        detail_cards = _subject_detail_cards(subject)
        recap_card = _subject_recap_card(subject)

        return Response(
            {
                "id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "description": subject.description,
                "detail_cards": detail_cards,
                "recap_card": recap_card,
            }
        )

    def patch(self, request, slug: str):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        update_fields = ["updated_at"]

        if "name" in payload:
            name = payload.get("name")
            if not isinstance(name, str) or not name.strip():
                raise DRFValidationError({"name": "name must be a non-empty string"})
            subject.name = name.strip()
            update_fields.append("name")

        if "slug" in payload:
            new_slug = slugify(payload.get("slug") or "")
            if not new_slug:
                raise DRFValidationError({"slug": "Invalid slug"})
            if new_slug != subject.slug and Subject.objects.filter(slug=new_slug).exists():
                raise DRFValidationError({"slug": "slug already exists"})
            subject.slug = new_slug
            update_fields.append("slug")

        if "description" in payload:
            subject.description = payload.get("description") or ""
            update_fields.append("description")

        if len(update_fields) == 1:
            raise DRFValidationError({"detail": "No fields to update"})

        subject.save(update_fields=update_fields)
        return Response(
            {
                "id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "description": subject.description,
            }
        )

    def delete(self, request, slug: str):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        subject.delete()
        return Response(status=204)


class SubjectCardsView(APIView):
    """Manage cards within a subject (admin only)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, slug: str):
        """Get all cards in a subject with their labels and order."""
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        links = (
            subject.subject_cards.select_related("microarticle")
            .order_by("sort_order")
        )
        items = [
            {
                "id": link.id,
                "microarticle_id": link.microarticle_id,
                "slug": link.microarticle.slug,
                "title": link.microarticle.title,
                "card_type": link.microarticle.card_type,
                "label": link.label,
                "sort_order": link.sort_order,
            }
            for link in links
        ]
        return Response(items)

    def post(self, request, slug: str):
        """Add a card to a subject."""
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        card_slug = payload.get("card_slug")
        if not card_slug or not isinstance(card_slug, str):
            raise DRFValidationError({"card_slug": "card_slug is required"})

        page = MicroArticlePage.objects.live().public().filter(slug=card_slug).first()
        if page is None:
            raise DRFValidationError({"card_slug": "Unknown card"})

        # Check for recap uniqueness
        if page.card_type == CardType.RECAP:
            existing_recap = subject.subject_cards.filter(
                microarticle__card_type=CardType.RECAP
            ).exclude(microarticle=page).exists()
            if existing_recap:
                raise DRFValidationError(
                    {"card_slug": "Subject already has a recap card"}
                )

        label = payload.get("label", "") or ""
        max_order = subject.subject_cards.aggregate(m=models.Max("sort_order"))["m"] or 0

        link, created = SubjectCard.objects.get_or_create(
            subject=subject,
            microarticle=page,
            defaults={"label": label, "sort_order": max_order + 1},
        )
        if not created and label:
            link.label = label
            link.save(update_fields=["label"])

        return Response(
            {
                "id": link.id,
                "microarticle_id": page.id,
                "slug": page.slug,
                "title": page.title,
                "card_type": page.card_type,
                "label": link.label,
                "sort_order": link.sort_order,
            },
            status=201 if created else 200,
        )


class SubjectCardDetailView(APIView):
    """Update or remove a card from a subject (admin only)."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, slug: str, card_id: int):
        """Update a card's label or order within a subject."""
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        link = SubjectCard.objects.filter(subject=subject, id=card_id).first()
        if link is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}

        if "label" in payload:
            link.label = payload.get("label") or ""
            link.save(update_fields=["label"])

        if "sort_order" in payload:
            new_order = payload.get("sort_order")
            if isinstance(new_order, int):
                link.sort_order = new_order
                link.save(update_fields=["sort_order"])

        return Response(
            {
                "id": link.id,
                "microarticle_id": link.microarticle_id,
                "label": link.label,
                "sort_order": link.sort_order,
            }
        )

    def delete(self, request, slug: str, card_id: int):
        """Remove a card from a subject."""
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        link = SubjectCard.objects.filter(subject=subject, id=card_id).first()
        if link is None:
            return Response(status=404)

        link.delete()
        return Response(status=204)


class SubjectCardsReorderView(APIView):
    """Reorder cards within a subject (admin only)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, slug: str):
        denied = _require_staff(request)
        if denied is not None:
            return denied

        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        payload = request.data if isinstance(request.data, dict) else {}
        order = payload.get("order")
        if not isinstance(order, list):
            raise DRFValidationError({"order": "order must be a list of card IDs"})

        links = {link.id: link for link in subject.subject_cards.all()}
        updated = []
        for idx, card_id in enumerate(order):
            link = links.get(card_id)
            if link is not None and link.sort_order != idx:
                link.sort_order = idx
                updated.append(link)

        if updated:
            SubjectCard.objects.bulk_update(updated, ["sort_order"])

        return Response({"ok": True, "updated": len(updated)})
