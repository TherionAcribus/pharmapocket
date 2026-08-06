from rest_framework import serializers

from content.serializers import CategoryPayloadSerializer, TagPayloadSerializer


class ProgressSerializer(serializers.Serializer):
    seen = serializers.BooleanField()
    completed = serializers.BooleanField()
    percent = serializers.IntegerField()
    time_ms = serializers.IntegerField()
    score_best = serializers.IntegerField(allow_null=True)
    score_last = serializers.IntegerField(allow_null=True)
    updated_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField(allow_null=True)


class FeedItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    cover_image_credit = serializers.CharField(allow_null=True, required=False)
    tags = TagPayloadSerializer(many=True)
    categories_theme = CategoryPayloadSerializer(many=True)
    categories_maladies = CategoryPayloadSerializer(many=True)
    categories_medicament = CategoryPayloadSerializer(many=True)
    categories_pharmacologie = CategoryPayloadSerializer(many=True, required=False)
    published_at = serializers.DateTimeField(allow_null=True)
    progress = ProgressSerializer(required=False, allow_null=True)


class MicroDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    cover_image_credit = serializers.CharField(allow_null=True, required=False)
    links = serializers.ListField(child=serializers.DictField())
    see_more = serializers.ListField(child=serializers.DictField())
    tags = TagPayloadSerializer(many=True)
    categories_theme = CategoryPayloadSerializer(many=True)
    categories_maladies = CategoryPayloadSerializer(many=True)
    categories_medicament = CategoryPayloadSerializer(many=True)
    categories_pharmacologie = CategoryPayloadSerializer(many=True, required=False)
    questions = serializers.ListField(child=serializers.DictField())
    published_at = serializers.DateTimeField(allow_null=True)
    progress = ProgressSerializer(required=False, allow_null=True)
