from rest_framework import serializers


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
    title_question = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    tags = serializers.ListField(child=serializers.DictField())
    categories_pharmacologie = serializers.ListField(child=serializers.DictField())
    categories_maladies = serializers.ListField(child=serializers.DictField())
    categories_classes = serializers.ListField(child=serializers.DictField())
    published_at = serializers.DateTimeField(allow_null=True)
    progress = ProgressSerializer(required=False, allow_null=True)


class MicroDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title_question = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    links = serializers.ListField(child=serializers.DictField())
    see_more = serializers.ListField(child=serializers.DictField())
    tags = serializers.ListField(child=serializers.DictField())
    categories_pharmacologie = serializers.ListField(child=serializers.DictField())
    categories_maladies = serializers.ListField(child=serializers.DictField())
    categories_classes = serializers.ListField(child=serializers.DictField())
    questions = serializers.ListField(child=serializers.DictField())
    published_at = serializers.DateTimeField(allow_null=True)
    progress = ProgressSerializer(required=False, allow_null=True)
