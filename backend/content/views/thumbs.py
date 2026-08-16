"""Overrides de vignettes par pathologie : lecture publique et CRUD staff."""

import hashlib
import json

from django.db import IntegrityError, transaction
from django.utils.cache import get_conditional_response, patch_vary_headers
from django.utils.http import quote_etag
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import PathologyThumbOverride
from ..permissions import IsStaff
from ..serializers import AdminThumbOverrideSerializer, ThumbOverridePublicSerializer
from ..serializers.inputs import ThumbOverrideCreateSerializer, ThumbOverridePatchSerializer


# Le contrôle d'unicité du serializer (SELECT) et l'écriture (INSERT/UPDATE) ne
# sont pas atomiques : entre les deux, une requête concurrente peut poser le même
# `pathology_slug`. La contrainte unique tranche alors en base et l'IntegrityError
# remonterait en 500 ; on la rattrape pour rendre le même 400 que le serializer.
_SLUG_TAKEN = {"pathology_slug": ["pathology_slug already exists"]}


def _thumb_override_payload(obj: PathologyThumbOverride) -> dict:
    return {
        "id": obj.id,
        "pathology_slug": obj.pathology_slug,
        "bg": obj.bg,
        "accent": obj.accent,
        "pattern": obj.pattern,
        "updated_at": obj.updated_at,
    }


# La liste publique est identique pour tous les appelants et ne bouge qu'à
# l'enregistrement d'un override depuis l'admin. Une minute de fraîcheur absorbe
# les rafales (un chargement de page = une liste entière de vignettes) sans faire
# attendre une correction éditoriale ; c'est aussi la durée de revalidation du
# préchargement serveur côté Next (`fetchThumbOverridesForSsr`), pour que les
# deux couches ne se contredisent pas.
_PUBLIC_MAX_AGE = 60

# Passé `max-age`, un cache partagé peut continuer à servir la réponse périmée
# pendant ce délai le temps de la rafraîchir en tâche de fond : personne
# n'attend jamais la base pour afficher des couleurs.
_PUBLIC_STALE_WHILE_REVALIDATE = 300


def _public_list_etag(items: list[dict], media_type: str | None) -> str:
    """Validateur dérivé de la charge utile réellement renvoyée.

    Volontairement pas un `MAX(updated_at)`, qui serait moins cher mais peut
    mentir : une écriture qui contourne `save()` — `queryset.update()`,
    `loaddata`, un script shell — ne touche pas `updated_at` et laisserait le
    validateur inchangé, donc les clients sur une couleur périmée jusqu'à
    expiration de *leur* cache. Hacher les octets ne peut pas se tromper, et la
    table est trop petite (une ligne par pathologie personnalisée) pour que la
    différence de coût se voie.

    Le type de média entre dans le hachage : la même URL sert le JSON et l'API
    navigable de DRF, deux représentations qui ne doivent pas partager un
    validateur — d'où aussi le `Vary: Accept` posé sur la réponse.
    """
    raw = json.dumps(
        {"media_type": media_type or "", "items": items},
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return quote_etag(hashlib.sha256(raw).hexdigest())


class ThumbOverridesPublicView(APIView):
    permission_classes = [AllowAny]

    # Aucun authenticator, là où le reste de l'API utilise la session : la
    # réponse ne dépend en rien de l'identité de l'appelant. Ce n'est pas
    # seulement une lecture de session économisée à chaque appel — authentifier
    # touche `request.session`, ce qui fait ajouter `Vary: Cookie` par
    # `SessionMiddleware` et découperait le cache partagé par utilisateur,
    # vidant de son sens le `Cache-Control: public` ci-dessous.
    #
    # Contrepartie assumée : un appel authentifié est désormais compté dans le
    # budget anonyme (par IP) et non plus dans le budget par compte. L'endpoint
    # est lu au plus une fois par chargement de page, et le rendu serveur — qui
    # concentre tous les visiteurs derrière une seule IP — est déjà exempté via
    # `THROTTLE_EXEMPT_IPS`.
    authentication_classes = []

    @extend_schema(
        operation_id="thumb_override_public_list",
        responses=ThumbOverridePublicSerializer(many=True),
    )
    def get(self, request):
        rows = PathologyThumbOverride.objects.all().order_by("pathology_slug", "id")
        items = [
            {
                "pathology_slug": r.pathology_slug,
                "bg": r.bg,
                "accent": r.accent,
                "pattern": r.pattern,
            }
            for r in rows
        ]

        etag = _public_list_etag(items, request.accepted_media_type)
        response = Response(items)
        response["ETag"] = etag
        response["Cache-Control"] = (
            f"public, max-age={_PUBLIC_MAX_AGE}, "
            f"stale-while-revalidate={_PUBLIC_STALE_WHILE_REVALIDATE}"
        )
        patch_vary_headers(response, ("Accept",))

        # Renvoie un 304 sans corps si le client détient déjà cette version.
        # Les en-têtes posés ci-dessus sont recopiés sur le 304 par Django, comme
        # l'exige la RFC : sans eux le client repartirait sans validateur ni
        # durée de fraîcheur, et redemanderait tout au coup suivant.
        return get_conditional_response(request, etag=etag, response=response)


class AdminThumbOverrideListCreateView(APIView):
    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="admin_thumb_override_list",
        responses=AdminThumbOverrideSerializer(many=True),
    )
    def get(self, request):
        rows = PathologyThumbOverride.objects.all().order_by("pathology_slug", "id")
        return Response([_thumb_override_payload(r) for r in rows])

    @extend_schema(
        operation_id="admin_thumb_override_create",
        request=ThumbOverrideCreateSerializer,
        responses={201: AdminThumbOverrideSerializer},
    )
    def post(self, request):
        serializer = ThumbOverrideCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # `atomic()` isole l'échec : sans lui l'IntegrityError laisserait la
            # transaction courante cassée et toute requête suivante échouerait.
            with transaction.atomic():
                obj = PathologyThumbOverride.objects.create(**serializer.validated_data)
        except IntegrityError:
            return Response(_SLUG_TAKEN, status=400)

        return Response(_thumb_override_payload(obj), status=201)


class AdminThumbOverrideDetailView(APIView):
    permission_classes = [IsStaff]

    @extend_schema(
        operation_id="admin_thumb_override_retrieve",
        responses=AdminThumbOverrideSerializer,
    )
    def get(self, request, pathology_slug: str):
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)
        return Response(_thumb_override_payload(obj))

    @extend_schema(
        operation_id="admin_thumb_override_update",
        request=ThumbOverridePatchSerializer,
        responses=AdminThumbOverrideSerializer,
    )
    def patch(self, request, pathology_slug: str):
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)

        serializer = ThumbOverridePatchSerializer(data=request.data, context={"override": obj})
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(obj, field, value)
        try:
            with transaction.atomic():
                obj.save(update_fields=[*serializer.validated_data, "updated_at"])
        except IntegrityError:
            # Même course sur un renommage : le slug visé a pu être pris entre-temps.
            return Response(_SLUG_TAKEN, status=400)

        return Response(_thumb_override_payload(obj))

    @extend_schema(operation_id="admin_thumb_override_delete", responses={204: None})
    def delete(self, request, pathology_slug: str):
        obj = PathologyThumbOverride.objects.filter(pathology_slug=pathology_slug).first()
        if obj is None:
            return Response(status=404)
        obj.delete()
        return Response(status=204)
