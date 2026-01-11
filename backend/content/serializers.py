from rest_framework import serializers

from .models import MicroArticlePage


class MicroArticleListSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    tags = serializers.ListField(child=serializers.CharField())
    tags_payload = serializers.ListField(child=serializers.DictField(), required=False)
    categories_theme_payload = serializers.ListField(child=serializers.DictField(), required=False)
    categories_maladies_payload = serializers.ListField(child=serializers.DictField(), required=False)
    categories_medicament_payload = serializers.ListField(child=serializers.DictField(), required=False)
    published_at = serializers.DateTimeField(allow_null=True, required=False)


class MicroArticleDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    links = serializers.ListField(child=serializers.DictField(), required=False)
    see_more = serializers.ListField(child=serializers.DictField(), required=False)
    is_saved = serializers.BooleanField(required=False)
    tags = serializers.ListField(child=serializers.CharField())
    categories_theme = serializers.ListField(child=serializers.CharField())
    categories_maladies = serializers.ListField(child=serializers.CharField())
    categories_medicament = serializers.ListField(child=serializers.CharField())
    tags_payload = serializers.ListField(child=serializers.DictField(), required=False)
    categories_theme_payload = serializers.ListField(child=serializers.DictField(), required=False)
    categories_maladies_payload = serializers.ListField(child=serializers.DictField(), required=False)
    categories_medicament_payload = serializers.ListField(child=serializers.DictField(), required=False)
    questions = serializers.ListField(child=serializers.DictField(), required=False)
    published_at = serializers.DateTimeField(allow_null=True, required=False)
