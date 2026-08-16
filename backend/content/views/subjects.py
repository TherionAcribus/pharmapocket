"""API des sujets : liste/détail publics, gestion des cartes réservée au staff."""

from django.db import IntegrityError, models, transaction
from django.db.models import Count, Exists, OuterRef, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CardType, Subject, SubjectCard
from ..permissions import IsStaff
from ..serializers import (
    CountUpdateResponseSerializer,
    SubjectCardSerializer,
    SubjectDetailResponseSerializer,
    SubjectListItemSerializer,
    SubjectMutationResponseSerializer,
)
from ..serializers.inputs import (
    SubjectCardAddSerializer,
    SubjectCardPatchSerializer,
    SubjectCardsReorderSerializer,
    SubjectCreateSerializer,
    SubjectPatchSerializer,
)
from .helpers import _subject_detail_cards, _subject_recap_card

# Le contrôle d'unicité du serializer (SELECT) et l'écriture (INSERT/UPDATE) ne
# sont pas atomiques : entre les deux, une requête concurrente peut poser le même
# slug. La contrainte unique tranche alors en base et l'IntegrityError remonterait
# en 500 ; on la rattrape pour rendre le même 400 que le serializer.
_SLUG_TAKEN = {"slug": ["slug already exists"]}


class SubjectListCreateView(APIView):
    """List all subjects or create a new one (admin only)."""

    permission_classes = [IsStaff]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return super().get_permissions()

    @extend_schema(
        operation_id="subject_list",
        parameters=[OpenApiParameter(name="q", type=str)],
        responses=SubjectListItemSerializer(many=True),
    )
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

    @extend_schema(
        operation_id="subject_create",
        request=SubjectCreateSerializer,
        responses={201: SubjectMutationResponseSerializer},
    )
    def post(self, request):
        serializer = SubjectCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # `atomic()` isole l'échec : sans lui l'IntegrityError laisserait la
            # transaction courante cassée et toute requête suivante échouerait.
            with transaction.atomic():
                subject = Subject.objects.create(**serializer.validated_data)
        except IntegrityError:
            return Response(_SLUG_TAKEN, status=400)

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

    permission_classes = [IsStaff]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return super().get_permissions()

    @extend_schema(operation_id="subject_retrieve", responses=SubjectDetailResponseSerializer)
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

    @extend_schema(
        operation_id="subject_update",
        request=SubjectPatchSerializer,
        responses=SubjectMutationResponseSerializer,
    )
    def patch(self, request, slug: str):
        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        serializer = SubjectPatchSerializer(data=request.data, context={"subject": subject})
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(subject, field, value)
        try:
            with transaction.atomic():
                subject.save(update_fields=[*serializer.validated_data, "updated_at"])
        except IntegrityError:
            # Même course sur un renommage : le slug visé a pu être pris entre-temps.
            return Response(_SLUG_TAKEN, status=400)

        return Response(
            {
                "id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "description": subject.description,
            }
        )

    @extend_schema(operation_id="subject_delete", responses={204: None})
    def delete(self, request, slug: str):
        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        subject.delete()
        return Response(status=204)


class SubjectCardsView(APIView):
    """Manage cards within a subject (admin only)."""

    permission_classes = [IsStaff]

    @extend_schema(operation_id="subject_card_list", responses=SubjectCardSerializer(many=True))
    def get(self, request, slug: str):
        """Get all cards in a subject with their labels and order."""
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

    @extend_schema(
        operation_id="subject_card_create",
        request=SubjectCardAddSerializer,
        responses={200: SubjectCardSerializer, 201: SubjectCardSerializer},
    )
    def post(self, request, slug: str):
        """Add a card to a subject."""
        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        serializer = SubjectCardAddSerializer(data=request.data, context={"subject": subject})
        serializer.is_valid(raise_exception=True)
        page = serializer.validated_data["card"]
        label = serializer.validated_data["label"]

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

    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="subject_card_update",
        request=SubjectCardPatchSerializer,
        responses=SubjectCardSerializer,
    )
    def patch(self, request, slug: str, card_id: int):
        """Update a card's label or order within a subject."""
        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        link = SubjectCard.objects.filter(subject=subject, id=card_id).first()
        if link is None:
            return Response(status=404)

        serializer = SubjectCardPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data:
            for field, value in serializer.validated_data.items():
                setattr(link, field, value)
            link.save(update_fields=list(serializer.validated_data))

        return Response(
            {
                "id": link.id,
                "microarticle_id": link.microarticle_id,
                "label": link.label,
                "sort_order": link.sort_order,
            }
        )

    @extend_schema(operation_id="subject_card_delete", responses={204: None})
    def delete(self, request, slug: str, card_id: int):
        """Remove a card from a subject."""
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

    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="subject_card_reorder",
        request=SubjectCardsReorderSerializer,
        responses=CountUpdateResponseSerializer,
    )
    def post(self, request, slug: str):
        subject = Subject.objects.filter(slug=slug).first()
        if subject is None:
            return Response(status=404)

        serializer = SubjectCardsReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.validated_data["order"]

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
