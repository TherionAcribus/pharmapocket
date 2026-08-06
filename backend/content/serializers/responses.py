"""Serializers des réponses construites manuellement par les vues de l'API v1.

Ces serializers sont le contrat OpenAPI des payloads qui ne passent pas encore
directement par un serializer DRF au moment de leur construction.
"""

from drf_spectacular.helpers import lazy_serializer
from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from .outputs import (
    ImagePayloadSerializer,
    MicroArticleListSerializer,
    SubjectDetailCardSerializer,
    SubjectRecapCardSerializer,
)


class DetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


class OkResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()


class CountUpdateResponseSerializer(OkResponseSerializer):
    updated = serializers.IntegerField(min_value=0)


class BulkAddResponseSerializer(serializers.Serializer):
    added = serializers.IntegerField(min_value=0)
    already_present = serializers.IntegerField(min_value=0)
    not_found = serializers.IntegerField(min_value=0, required=False)


class LandingStepSerializer(serializers.Serializer):
    title = serializers.CharField()
    detail = serializers.CharField()


class LandingCardSerializer(serializers.Serializer):
    title = serializers.CharField()
    summary = serializers.CharField()
    cta_label = serializers.CharField()
    href = serializers.CharField()


class LandingPayloadSerializer(serializers.Serializer):
    title = serializers.CharField()
    hero_title = serializers.CharField()
    hero_subtitle = serializers.CharField()
    hero_bullets = serializers.ListField(child=serializers.CharField())
    steps = LandingStepSerializer(many=True)
    cards = LandingCardSerializer(many=True)
    primary_cta_label = serializers.CharField()
    primary_cta_target = serializers.CharField()
    secondary_cta_label = serializers.CharField()
    secondary_cta_target = serializers.CharField()


class TaxonomyNodeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    parent_id = serializers.IntegerField(allow_null=True)
    children = serializers.SerializerMethodField()

    @extend_schema_field(
        lazy_serializer("content.serializers.responses.TaxonomyNodeSerializer")(many=True)
    )
    def get_children(self, obj):
        return obj.get("children", []) if isinstance(obj, dict) else []


class TaxonomyTreeResponseSerializer(serializers.Serializer):
    taxonomy = serializers.CharField()
    tree = TaxonomyNodeSerializer(many=True)


class TaxonomyBreadcrumbSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()


class TaxonomyResolveResponseSerializer(serializers.Serializer):
    taxonomy = serializers.CharField()
    node_id = serializers.IntegerField()
    breadcrumb = TaxonomyBreadcrumbSerializer(many=True)
    canonical_path = serializers.CharField()


class SavedStateSerializer(serializers.Serializer):
    saved = serializers.BooleanField()


class ReadStateMapSerializer(serializers.Serializer):
    items = serializers.DictField(child=serializers.BooleanField())


class ReadStateSerializer(serializers.Serializer):
    slug = serializers.CharField()
    is_read = serializers.BooleanField()


class DeckSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()
    sort_order = serializers.IntegerField()
    cards_count = serializers.IntegerField(min_value=0)
    source_pack_id = serializers.IntegerField(allow_null=True)


class DeckMutationResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()
    sort_order = serializers.IntegerField()


class DeckMembershipSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()
    is_member = serializers.BooleanField()


@extend_schema_serializer(component_name="DeckCardItem")
class DeckCardItemSerializer(MicroArticleListSerializer):
    decks_count = serializers.IntegerField(min_value=0, required=False)
    deck_card_id = serializers.IntegerField(required=False)
    position = serializers.IntegerField(required=False)
    sort_order = serializers.IntegerField(required=False)
    is_optional = serializers.BooleanField(required=False)
    notes = serializers.CharField(allow_blank=True, required=False)


class DeckCardsResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=0)
    results = DeckCardItemSerializer(many=True)


class OfficialPackProgressSerializer(serializers.Serializer):
    deck_id = serializers.IntegerField(required=False)
    started_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField(allow_null=True)
    cards_seen_count = serializers.IntegerField(min_value=0)
    cards_done_count = serializers.IntegerField(min_value=0)
    progress_pct = serializers.IntegerField(min_value=0, max_value=100)
    mode_last = serializers.CharField(allow_blank=True)
    last_card_id = serializers.IntegerField(allow_null=True)


class OfficialPackSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    cover_image_url = serializers.CharField(allow_null=True)
    cover_image_credit = serializers.CharField(allow_null=True, required=False)
    cover_image = ImagePayloadSerializer(allow_null=True, required=False)
    difficulty = serializers.CharField(allow_blank=True)
    estimated_minutes = serializers.IntegerField(allow_null=True)
    status = serializers.CharField()
    type = serializers.CharField()
    cards_count = serializers.IntegerField(min_value=0)
    progress = OfficialPackProgressSerializer(allow_null=True, required=False)


class OfficialPackDetailSerializer(OfficialPackSummarySerializer):
    source_pack_id = serializers.IntegerField(allow_null=True, required=False)
    cards = DeckCardItemSerializer(many=True)


class AdminPackSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    difficulty = serializers.CharField(allow_blank=True)
    estimated_minutes = serializers.IntegerField(allow_null=True)
    status = serializers.CharField()
    type = serializers.CharField()
    sort_order = serializers.IntegerField()
    cards_count = serializers.IntegerField(min_value=0, required=False)
    cover_image_url = serializers.CharField(allow_null=True)
    cover_image_credit = serializers.CharField(allow_null=True, required=False)
    cover_image = ImagePayloadSerializer(allow_null=True, required=False)


class AdminPackDetailSerializer(AdminPackSummarySerializer):
    cards_count = serializers.IntegerField(min_value=0)
    cards = DeckCardItemSerializer(many=True)


class AdminMicroArticleSearchResultSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    packs_count = serializers.IntegerField(min_value=0)


class UnknownCategorySerializer(serializers.Serializer):
    """Catégorie citée par le JSON et absente de l'arbre, prête à être créée."""

    field = serializers.CharField()
    taxonomy = serializers.CharField()
    value = serializers.CharField()
    suggested_name = serializers.CharField()
    suggested_slug = serializers.CharField()


class AdminTaxonomyNodeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    depth = serializers.IntegerField()
    parent_id = serializers.IntegerField(allow_null=True)
    taxonomy = serializers.CharField()


class AdminCardImportResultSerializer(serializers.Serializer):
    """Résultat d'une carte du lot ; `ok=False` porte les erreurs à corriger."""

    index = serializers.IntegerField()
    ok = serializers.BooleanField()
    id = serializers.IntegerField(required=False)
    slug = serializers.CharField(required=False)
    title = serializers.CharField(required=False)
    card_type = serializers.CharField(required=False)
    status = serializers.CharField(required=False)
    action = serializers.ChoiceField(choices=["created", "updated"], required=False)
    subject = serializers.CharField(allow_null=True, required=False)
    created_sources = serializers.ListField(child=serializers.CharField(), required=False)
    created_tags = serializers.ListField(child=serializers.CharField(), required=False)
    created_questions = serializers.IntegerField(required=False)
    reused_questions = serializers.IntegerField(required=False)
    tags = serializers.ListField(child=serializers.CharField(), required=False)
    errors = serializers.ListField(child=serializers.CharField())
    warnings = serializers.ListField(child=serializers.CharField())
    unknown_categories = UnknownCategorySerializer(many=True, required=False)


class AdminCardImportReportSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    dry_run = serializers.BooleanField()
    published = serializers.BooleanField(required=False)
    imported = serializers.IntegerField(required=False)
    updated = serializers.IntegerField(required=False)
    detail = serializers.CharField(required=False)
    # Dédoublonnées sur tout le lot : c'est la liste que le back-office propose
    # de créer en un geste avant de relancer l'import.
    unknown_categories = UnknownCategorySerializer(many=True)
    results = AdminCardImportResultSerializer(many=True)


class DefaultDeckResponseSerializer(OkResponseSerializer):
    default_deck_id = serializers.IntegerField()


class CopyDeckResponseSerializer(serializers.Serializer):
    deck_id = serializers.IntegerField()


class CardDecksUpdateResponseSerializer(OkResponseSerializer):
    deck_ids = serializers.ListField(child=serializers.IntegerField())


class SubjectListItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    cards_count = serializers.IntegerField(min_value=0)
    has_recap = serializers.BooleanField()


class SubjectMutationResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField(allow_blank=True)


class SubjectDetailResponseSerializer(SubjectMutationResponseSerializer):
    detail_cards = SubjectDetailCardSerializer(many=True)
    recap_card = SubjectRecapCardSerializer(allow_null=True)


class SubjectCardSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    microarticle_id = serializers.IntegerField()
    slug = serializers.CharField(required=False)
    title = serializers.CharField(required=False)
    card_type = serializers.ChoiceField(
        choices=["standard", "recap", "detail"], required=False
    )
    label = serializers.CharField(allow_blank=True)
    sort_order = serializers.IntegerField()


class ThumbOverridePublicSerializer(serializers.Serializer):
    pathology_slug = serializers.CharField()
    bg = serializers.CharField()
    accent = serializers.CharField()
    pattern = serializers.CharField()


class AdminThumbOverrideSerializer(ThumbOverridePublicSerializer):
    id = serializers.IntegerField()
    updated_at = serializers.DateTimeField()
