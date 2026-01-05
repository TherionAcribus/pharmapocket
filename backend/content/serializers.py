from rest_framework import serializers

from .models import MicroArticlePage


class MicroArticleListSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title_question = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    tags = serializers.ListField(child=serializers.CharField())


class MicroArticleDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title_question = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    links = serializers.ListField(child=serializers.DictField(), required=False)
    see_more = serializers.ListField(child=serializers.DictField(), required=False)
    tags = serializers.ListField(child=serializers.CharField())
    categories_pharmacologie = serializers.ListField(child=serializers.CharField())
    categories_maladies = serializers.ListField(child=serializers.CharField())
    categories_classes = serializers.ListField(child=serializers.CharField())
