from rest_framework import serializers


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
