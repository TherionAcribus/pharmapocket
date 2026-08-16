from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from content.serializers import MicroArticleListSerializer


@extend_schema_field(MicroArticleListSerializer)
class SRSCardField(serializers.DictField):
    """Conserve le dict à l'exécution tout en décrivant sa forme dans OpenAPI."""


class LessonProgressUpdateSerializer(serializers.Serializer):
    seen = serializers.BooleanField(required=False)
    completed = serializers.BooleanField(required=False)
    percent = serializers.IntegerField(min_value=0, max_value=100, required=False)
    time_ms = serializers.IntegerField(min_value=0, required=False)
    score_best = serializers.IntegerField(min_value=0, max_value=100, required=False, allow_null=True)
    score_last = serializers.IntegerField(min_value=0, max_value=100, required=False, allow_null=True)
    updated_at = serializers.DateTimeField(required=True)
    last_seen_at = serializers.DateTimeField(required=False, allow_null=True)


class LessonProgressSerializer(serializers.Serializer):
    lesson_id = serializers.IntegerField()
    seen = serializers.BooleanField()
    completed = serializers.BooleanField()
    percent = serializers.IntegerField()
    time_ms = serializers.IntegerField()
    score_best = serializers.IntegerField(allow_null=True)
    score_last = serializers.IntegerField(allow_null=True)
    updated_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField(allow_null=True)


class ProgressImportSerializer(serializers.Serializer):
    device_id = serializers.CharField(required=False, allow_blank=True)
    lessons = serializers.DictField(child=LessonProgressUpdateSerializer())


class ProgressImportResponseSerializer(serializers.Serializer):
    imported = serializers.IntegerField(min_value=0)
    updated = serializers.IntegerField(min_value=0)


class SRSNextQuerySerializer(serializers.Serializer):
    scope = serializers.ChoiceField(
        choices=["all_decks", "deck", "decks", "all_cards"],
        required=False,
        default="all_decks",
    )
    deck_id = serializers.IntegerField(min_value=1, required=False)
    deck_ids = serializers.CharField(required=False)
    only_due = serializers.BooleanField(required=False, default=True)


class SRSCountsQuerySerializer(serializers.Serializer):
    scope = serializers.ChoiceField(
        choices=["all_decks", "deck", "decks", "all_cards"],
        required=False,
        default="all_decks",
    )
    deck_id = serializers.IntegerField(min_value=1, required=False)
    deck_ids = serializers.CharField(required=False)


class SRSCountsSerializer(serializers.Serializer):
    due = serializers.IntegerField(min_value=0)
    new = serializers.IntegerField(min_value=0)
    later = serializers.IntegerField(min_value=0)
    total = serializers.IntegerField(min_value=0)


class SRSReviewSerializer(serializers.Serializer):
    card_id = serializers.IntegerField(min_value=1)
    rating = serializers.ChoiceField(choices=["know", "medium", "again"])


class SRSStateSerializer(serializers.Serializer):
    level = serializers.IntegerField(min_value=1)
    due_at = serializers.DateTimeField()
    last_reviewed_at = serializers.DateTimeField(allow_null=True, required=False)
    reviews_count = serializers.IntegerField(min_value=0)
    last_rating = serializers.CharField(required=False)


class SRSNextSerializer(serializers.Serializer):
    card = SRSCardField(allow_null=True)
    srs = SRSStateSerializer(allow_null=True)
