"""Serializers d'entrée : un par endpoint qui accepte un corps de requête.

Les vues se contentent de `serializer.is_valid(raise_exception=True)` puis lisent
`validated_data` ; toute la validation de forme (types, champs obligatoires,
bornes, unicité, résolution des références) vit ici. Conséquence directe : les
réponses 400 de l'app ont toutes la forme DRF `{"champ": ["message"]}`.

Les messages reprennent volontairement ceux que l'API renvoyait avant, pour que
le passage aux serializers ne soit pas une rupture de contrat côté client.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from wagtail.images import get_image_model
from wagtail.images.fields import WagtailImageField

from ..models import (
    CardType,
    Deck,
    DeckCard,
    MicroArticlePage,
    PathologyThumbOverride,
    Subject,
    UserDeckProgress,
)

# `Deck.name` et `Subject.name` : longueurs reprises des modèles pour renvoyer un
# 400 lisible là où la base aurait levé une erreur de troncature (500).
DECK_NAME_MAX_LENGTH = 60
DECK_DIFFICULTY_MAX_LENGTH = 16
SUBJECT_NAME_MAX_LENGTH = 120
SUBJECT_CARD_LABEL_MAX_LENGTH = 120
# `Deck.estimated_minutes` est un PositiveSmallIntegerField.
ESTIMATED_MINUTES_MAX = 32767


# ---------------------------------------------------------------------------
# Champs et mixins réutilisables
# ---------------------------------------------------------------------------


def is_hex_color(value: str) -> bool:
    """`#RGB`, `#RRGGBB` ou `#RRGGBBAA`."""
    if not isinstance(value, str):
        return False
    s = value.strip()
    if not s.startswith("#"):
        return False
    hex_part = s[1:]
    if len(hex_part) not in (3, 6, 8):
        return False
    try:
        int(hex_part, 16)
    except ValueError:
        return False
    return True


class HexColorField(serializers.CharField):
    """Couleur hexadécimale. Toutes les erreurs partagent le même message."""

    def __init__(self, *, example: str, **kwargs):
        self.example = example
        super().__init__(**kwargs)

    def bind(self, field_name, parent):
        super().bind(field_name, parent)
        message = f"{field_name} must be a hex color (ex: {self.example})"
        for key in ("required", "null", "invalid", "blank"):
            self.error_messages[key] = message

    def to_internal_value(self, data):
        if not is_hex_color(data):
            self.fail("invalid")
        return data.strip()


class SlugifiedField(serializers.CharField):
    """Applique `slugify` et refuse un résultat vide (`Invalid <champ>`)."""

    def to_internal_value(self, data):
        value = slugify(super().to_internal_value(data))
        if not value:
            raise serializers.ValidationError(f"Invalid {self.field_name}")
        return value


class NullableIntegerField(serializers.IntegerField):
    """Entier optionnel où `""` vaut `null` (les formulaires du back-office
    envoient une chaîne vide quand l'utilisateur efface le champ)."""

    def __init__(self, **kwargs):
        kwargs.setdefault("allow_null", True)
        super().__init__(**kwargs)

    def validate_empty_values(self, data):
        if data == "":
            return (True, None)
        return super().validate_empty_values(data)


class MicroArticleSlugField(serializers.CharField):
    """Résout un slug de fiche publiée en `MicroArticlePage`.

    `filter(...).first()` et non `get()` : un slug Wagtail n'est unique que sous
    un même parent, deux fiches peuvent donc le partager.
    """

    default_error_messages = {"does_not_exist": "Unknown microarticle"}

    def to_internal_value(self, data):
        slug = super().to_internal_value(data)
        page = MicroArticlePage.objects.live().public().filter(slug=slug).first()
        if page is None:
            self.fail("does_not_exist")
        return page


class PublicMicroArticlePrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """Construit le queryset public à la validation, jamais à l'import du module."""

    def get_queryset(self):
        return MicroArticlePage.objects.live().public()


class FlatListField(serializers.ListField):
    """`ListField` dont les erreurs d'éléments restent plates.

    `ListField` indexe les erreurs de ses enfants (`{"champ": {0: [...]}}`) ; la
    position n'apprend rien ici et casserait le format `{"champ": ["message"]}`
    du reste de l'API.
    """

    def __init__(self, *, item_message: str, **kwargs):
        self.item_message = item_message
        super().__init__(**kwargs)

    def run_child_validation(self, data):
        try:
            return super().run_child_validation(data)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError(self.item_message) from exc


@extend_schema_field(OpenApiTypes.BINARY)
class WagtailImageUploadField(serializers.Field):
    """Rejoue sur un upload brut la validation du champ image de Wagtail.

    `WagtailImageField` vérifie l'extension (`WAGTAILIMAGES_EXTENSIONS`), la
    cohérence entre extension et format réel, la taille et le nombre de pixels.
    """

    def to_internal_value(self, data):
        try:
            return WagtailImageField(required=True).clean(data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc

    def to_representation(self, value):  # pragma: no cover - champ d'entrée seul
        return None


class AtLeastOneFieldMixin:
    """PATCH partiels : refuse un corps qui ne porte aucun champ connu."""

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs:
            raise serializers.ValidationError({"detail": "No fields to update"})
        return attrs


def _required_messages(message: str) -> dict:
    """Même message pour « absent », « null », « vide » et « mauvais type »."""
    return {"required": message, "null": message, "blank": message, "invalid": message}


def _list_messages(message: str) -> dict:
    return {"required": message, "null": message, "not_a_list": message}


# ---------------------------------------------------------------------------
# Feed : sauvegardes et état de lecture
# ---------------------------------------------------------------------------


class SavedMicroArticleCreateSerializer(serializers.Serializer):
    """POST /saved/ — `validated_data["page"]` est la fiche résolue."""

    slug = MicroArticleSlugField(
        source="page",
        error_messages=_required_messages("slug is required"),
    )


class MicroArticleReadStateSerializer(serializers.Serializer):
    """POST /read-state/ — `validated_data["page"]` est la fiche résolue."""

    slug = MicroArticleSlugField(
        source="page",
        error_messages=_required_messages("slug is required"),
    )
    is_read = serializers.BooleanField(
        error_messages=_required_messages("is_read must be a boolean"),
    )


# ---------------------------------------------------------------------------
# Decks utilisateur et packs officiels
# ---------------------------------------------------------------------------


class DeckCreateSerializer(serializers.Serializer):
    """POST /decks/"""

    name = serializers.CharField(
        max_length=DECK_NAME_MAX_LENGTH,
        error_messages=_required_messages("name is required"),
    )


class DeckPatchSerializer(AtLeastOneFieldMixin, serializers.Serializer):
    """PATCH /decks/<id>/"""

    name = serializers.CharField(
        required=False,
        max_length=DECK_NAME_MAX_LENGTH,
        error_messages=_required_messages("name must be a non-empty string"),
    )
    sort_order = serializers.IntegerField(
        required=False,
        error_messages=_required_messages("sort_order must be an integer"),
    )


class DeckCardAddSerializer(serializers.Serializer):
    """POST /decks/<id>/cards/ — `validated_data["card"]` est la fiche résolue."""

    card_id = PublicMicroArticlePrimaryKeyRelatedField(
        source="card",
        queryset=MicroArticlePage.objects.none(),
        error_messages={
            "required": "card_id is required",
            "null": "card_id is required",
            "incorrect_type": "card_id must be an integer",
            "does_not_exist": "Unknown or unavailable card",
        },
    )


class DeckCardsBulkAddSerializer(serializers.Serializer):
    """POST /decks/<id>/cards/bulk-add/ — accepte `card_ids` ou `microarticle_ids`.

    `validated_data["card_ids"]` est dédoublonné, ordonné et débarrassé des ids
    non positifs ; il reste à vérifier que les fiches sont publiques.
    """

    card_ids = FlatListField(
        child=serializers.IntegerField(),
        item_message="card_ids must be a list of integers",
        required=False,
        error_messages=_list_messages("card_ids must be a list"),
    )
    microarticle_ids = FlatListField(
        child=serializers.IntegerField(),
        item_message="card_ids must be a list of integers",
        required=False,
        error_messages=_list_messages("card_ids must be a list"),
    )

    def validate(self, attrs):
        # `or` et non `if in` : une liste vide bascule sur l'autre clé, comme avant.
        ids = attrs.get("card_ids") or attrs.get("microarticle_ids")
        if ids is None:
            raise serializers.ValidationError({"card_ids": "card_ids must be a list"})
        return {"card_ids": list(dict.fromkeys(i for i in ids if i > 0))}


class CardDecksUpdateSerializer(serializers.Serializer):
    """PUT /cards/<id>/decks/"""

    deck_ids = FlatListField(
        child=serializers.IntegerField(),
        item_message="deck_ids must contain integers",
        error_messages=_list_messages("deck_ids must be a list"),
    )


class OfficialDeckProgressSerializer(serializers.Serializer):
    """POST /decks/<id>/progress/ — `context["deck"]` porte le pack ciblé.

    Tous les champs sont facultatifs : la vue n'écrit que ceux qui sont fournis
    et rafraîchit `last_seen_at` dans tous les cas.
    """

    mode_last = serializers.ChoiceField(
        choices=UserDeckProgress.ProgressMode.choices,
        required=False,
        error_messages={"invalid_choice": "invalid mode_last", "null": "invalid mode_last"},
    )
    last_card_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages=_required_messages("last_card_id must be an integer"),
    )
    cards_seen_count = serializers.IntegerField(
        required=False,
        error_messages=_required_messages("cards_seen_count must be an integer"),
    )
    cards_done_count = serializers.IntegerField(
        required=False,
        error_messages=_required_messages("cards_done_count must be an integer"),
    )

    def validate_last_card_id(self, value):
        if value is None:
            return None
        deck = self.context["deck"]
        is_available = DeckCard.objects.filter(
            deck_id=deck.id,
            microarticle_id=value,
            microarticle_id__in=MicroArticlePage.objects.live().public().values_list("id", flat=True),
        ).exists()
        if not is_available:
            raise serializers.ValidationError("Unknown or unavailable card in this deck")
        return value

    def validate_cards_seen_count(self, value):
        return max(0, value)

    def validate_cards_done_count(self, value):
        return max(0, value)


# ---------------------------------------------------------------------------
# Sujets
# ---------------------------------------------------------------------------


class SubjectCreateSerializer(serializers.Serializer):
    """POST /subjects/ — le slug est déduit du nom quand il n'est pas fourni."""

    name = serializers.CharField(
        max_length=SUBJECT_NAME_MAX_LENGTH,
        error_messages=_required_messages("name is required"),
    )
    slug = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )

    def validate_description(self, value):
        return value or ""

    def validate(self, attrs):
        slug = slugify(attrs.get("slug") or attrs["name"])
        if not slug:
            raise serializers.ValidationError({"slug": "Invalid slug"})
        if Subject.objects.filter(slug=slug).exists():
            raise serializers.ValidationError({"slug": "slug already exists"})
        attrs["slug"] = slug
        return attrs


class SubjectPatchSerializer(AtLeastOneFieldMixin, serializers.Serializer):
    """PATCH /subjects/<slug>/ — `context["subject"]` porte le sujet ciblé."""

    name = serializers.CharField(
        required=False,
        max_length=SUBJECT_NAME_MAX_LENGTH,
        error_messages=_required_messages("name must be a non-empty string"),
    )
    slug = SlugifiedField(required=False, error_messages=_required_messages("Invalid slug"))
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_description(self, value):
        return value or ""

    def validate_slug(self, value):
        subject = self.context["subject"]
        if value != subject.slug and Subject.objects.filter(slug=value).exists():
            raise serializers.ValidationError("slug already exists")
        return value


class SubjectCardAddSerializer(serializers.Serializer):
    """POST /subjects/<slug>/cards/ — `context["subject"]` porte le sujet ciblé.

    `validated_data["card"]` est la fiche résolue.
    """

    card_slug = MicroArticleSlugField(
        source="card",
        error_messages={
            **_required_messages("card_slug is required"),
            "does_not_exist": "Unknown card",
        },
    )
    label = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default="",
        max_length=SUBJECT_CARD_LABEL_MAX_LENGTH,
    )

    def validate_label(self, value):
        return value or ""

    def validate(self, attrs):
        page = attrs["card"]
        if page.card_type != CardType.RECAP:
            return attrs
        # Un sujet ne porte qu'une seule fiche récap.
        subject = self.context["subject"]
        has_other_recap = (
            subject.subject_cards.filter(microarticle__card_type=CardType.RECAP)
            .exclude(microarticle=page)
            .exists()
        )
        if has_other_recap:
            raise serializers.ValidationError({"card_slug": "Subject already has a recap card"})
        return attrs


class SubjectCardPatchSerializer(serializers.Serializer):
    """PATCH /subjects/<slug>/cards/<id>/ — un corps vide laisse le lien tel quel."""

    label = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=SUBJECT_CARD_LABEL_MAX_LENGTH,
    )
    sort_order = serializers.IntegerField(
        required=False,
        error_messages=_required_messages("sort_order must be an integer"),
    )

    def validate_label(self, value):
        return value or ""


class SubjectCardsReorderSerializer(serializers.Serializer):
    """POST /subjects/<slug>/cards/reorder/ — les ids inconnus sont ignorés par la vue."""

    order = FlatListField(
        child=serializers.IntegerField(),
        item_message="order must be a list of card IDs",
        error_messages=_list_messages("order must be a list of card IDs"),
    )


# ---------------------------------------------------------------------------
# Overrides de vignettes
# ---------------------------------------------------------------------------


class ThumbOverrideCreateSerializer(serializers.Serializer):
    """POST /admin/thumb-overrides/"""

    pathology_slug = SlugifiedField(
        error_messages=_required_messages("pathology_slug is required")
    )
    bg = HexColorField(example="#6D5BD0")
    accent = HexColorField(example="#D7D2FF")
    pattern = serializers.ChoiceField(
        choices=PathologyThumbOverride.Pattern.choices,
        error_messages={
            "required": "invalid pattern",
            "null": "invalid pattern",
            "invalid_choice": "invalid pattern",
        },
    )

    def validate_pathology_slug(self, value):
        if PathologyThumbOverride.objects.filter(pathology_slug=value).exists():
            raise serializers.ValidationError("pathology_slug already exists")
        return value


class ThumbOverridePatchSerializer(AtLeastOneFieldMixin, serializers.Serializer):
    """PATCH /admin/thumb-overrides/<slug>/ — `context["override"]` porte la ligne ciblée."""

    pathology_slug = SlugifiedField(
        required=False,
        error_messages=_required_messages("pathology_slug must be a non-empty string"),
    )
    bg = HexColorField(required=False, example="#6D5BD0")
    accent = HexColorField(required=False, example="#D7D2FF")
    pattern = serializers.ChoiceField(
        choices=PathologyThumbOverride.Pattern.choices,
        required=False,
        error_messages={
            "null": "invalid pattern",
            "invalid_choice": "invalid pattern",
        },
    )

    def validate_pathology_slug(self, value):
        override = self.context["override"]
        if (
            value != override.pathology_slug
            and PathologyThumbOverride.objects.filter(pathology_slug=value).exists()
        ):
            raise serializers.ValidationError("pathology_slug already exists")
        return value


# ---------------------------------------------------------------------------
# Back-office des packs officiels
# ---------------------------------------------------------------------------


class _AdminPackFieldsMixin:
    """Champs communs aux serializers de création et de mise à jour d'un pack."""

    def validate_description(self, value):
        return value or ""

    def validate_difficulty(self, value):
        return value or ""

    def validate_cover_image_id(self, value):
        # Sans ce contrôle, un id inconnu remonte en IntegrityError (500).
        if value is not None and not get_image_model().objects.filter(id=value).exists():
            raise serializers.ValidationError("Unknown image")
        return value


class AdminPackCreateSerializer(_AdminPackFieldsMixin, serializers.Serializer):
    """POST /admin/packs/ — `sort_order` absent ou nul = à la suite des packs existants."""

    name = serializers.CharField(
        max_length=DECK_NAME_MAX_LENGTH,
        error_messages=_required_messages("name is required"),
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages={"invalid": "description must be a string"},
    )
    difficulty = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=DECK_DIFFICULTY_MAX_LENGTH,
        error_messages={"invalid": "difficulty must be a string"},
    )
    estimated_minutes = NullableIntegerField(
        required=False,
        min_value=0,
        max_value=ESTIMATED_MINUTES_MAX,
        error_messages=_required_messages("estimated_minutes must be an integer"),
    )
    status = serializers.ChoiceField(
        choices=Deck.Status.choices,
        required=False,
        allow_null=True,
        error_messages={"invalid_choice": "invalid status"},
    )
    cover_image_id = NullableIntegerField(
        required=False,
        error_messages=_required_messages("cover_image_id must be an integer"),
    )
    sort_order = NullableIntegerField(
        required=False,
        error_messages=_required_messages("sort_order must be an integer"),
    )


class AdminPackPatchSerializer(
    _AdminPackFieldsMixin, AtLeastOneFieldMixin, serializers.Serializer
):
    """PATCH /admin/packs/<id>/"""

    name = serializers.CharField(
        required=False,
        max_length=DECK_NAME_MAX_LENGTH,
        error_messages=_required_messages("name must be a non-empty string"),
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages={"invalid": "description must be a string"},
    )
    difficulty = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=DECK_DIFFICULTY_MAX_LENGTH,
        error_messages={"invalid": "difficulty must be a string"},
    )
    estimated_minutes = NullableIntegerField(
        required=False,
        min_value=0,
        max_value=ESTIMATED_MINUTES_MAX,
        error_messages=_required_messages("estimated_minutes must be an integer"),
    )
    status = serializers.ChoiceField(
        choices=Deck.Status.choices,
        required=False,
        error_messages={"invalid_choice": "invalid status", "null": "invalid status"},
    )
    cover_image_id = NullableIntegerField(
        required=False,
        error_messages=_required_messages("cover_image_id must be an integer"),
    )
    sort_order = serializers.IntegerField(
        required=False,
        error_messages=_required_messages("sort_order must be an integer"),
    )


def parse_bulk_tokens(raw: str) -> list[str]:
    """Découpe un collage libre (retours à la ligne, virgules, points-virgules)."""
    if not raw:
        return []
    parts: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        parts.extend([p for p in line.replace(",", " ").replace(";", " ").split() if p])
    return [p.strip() for p in parts if p.strip()]


class AdminPackBulkAddSerializer(serializers.Serializer):
    """POST /admin/packs/<id>/bulk-add/.

    Trois formes d'entrée, dans cet ordre de priorité : `items` (texte collé),
    `microarticle_ids` puis `slugs`. Toutes se ramènent à
    `validated_data["tokens"]`, une liste de jetons id-ou-slug que la vue résout.
    """

    items = serializers.CharField(required=False, allow_blank=True)
    # `CharField` accepte aussi les entiers (il les convertit) : la liste d'ids
    # numériques et la liste de slugs passent donc par le même champ.
    microarticle_ids = FlatListField(
        child=serializers.CharField(),
        item_message="microarticle_ids must be a list of ids or slugs",
        required=False,
    )
    slugs = FlatListField(
        child=serializers.CharField(),
        item_message="slugs must be a list of slugs",
        required=False,
    )

    def validate(self, attrs):
        if "items" in attrs:
            tokens = parse_bulk_tokens(attrs["items"])
        elif "microarticle_ids" in attrs:
            tokens = attrs["microarticle_ids"]
        elif "slugs" in attrs:
            tokens = attrs["slugs"]
        else:
            raise serializers.ValidationError(
                {"detail": "Provide items (string) or microarticle_ids/slugs (list)"}
            )
        return {"tokens": tokens}


class AdminPackReorderSerializer(serializers.Serializer):
    """POST /admin/packs/<id>/cards/reorder/"""

    microarticle_ids = FlatListField(
        child=serializers.IntegerField(),
        item_message="microarticle_ids must be a list of integers",
        error_messages=_list_messages("microarticle_ids must be a list"),
    )


class AdminImageUploadSerializer(serializers.Serializer):
    """POST /admin/images/upload/ — le fichier arrive sous `file` ou `image`.

    `validated_data` expose `file` (l'upload validé) et `title` (celui fourni,
    sinon le nom du fichier).
    """

    file = WagtailImageUploadField(required=False)
    image = WagtailImageUploadField(required=False)
    title = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        upload = attrs.get("file") or attrs.get("image")
        if upload is None:
            raise serializers.ValidationError({"file": "file is required"})
        title = (attrs.get("title") or "").strip() or getattr(upload, "name", "cover")
        return {"file": upload, "title": title}
