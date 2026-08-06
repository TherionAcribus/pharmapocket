"""Serializers du contrat OpenAPI pour les endpoints transverses."""

from rest_framework import serializers


LANDING_TARGETS = ["start", "discover", "cards", "review", "quiz"]


class DetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


class CurrentUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField(allow_blank=True)
    username = serializers.CharField()
    pseudo = serializers.CharField(allow_blank=True)
    has_usable_password = serializers.BooleanField()
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    landing_redirect_enabled = serializers.BooleanField()
    landing_redirect_target = serializers.ChoiceField(choices=LANDING_TARGETS)


class AccountSummarySerializer(serializers.Serializer):
    email = serializers.EmailField(allow_blank=True)
    username = serializers.CharField()
    pseudo = serializers.CharField(allow_blank=True)
    has_usable_password = serializers.BooleanField()


class AccountUpdateSerializer(serializers.Serializer):
    pseudo = serializers.CharField(allow_blank=True, allow_null=True)


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(allow_blank=True, required=False, write_only=True)


class UserPreferencesSerializer(serializers.Serializer):
    landing_redirect_enabled = serializers.BooleanField()
    landing_redirect_target = serializers.ChoiceField(choices=LANDING_TARGETS)


class UserPreferencesUpdateSerializer(serializers.Serializer):
    landing_redirect_enabled = serializers.BooleanField(required=False)
    landing_redirect_target = serializers.ChoiceField(
        choices=LANDING_TARGETS,
        required=False,
    )
