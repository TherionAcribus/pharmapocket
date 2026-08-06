"""Serializers de sortie : forme des payloads renvoyés par l'API."""

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer

from ..html import sanitize_rich_text


def image_payload(image) -> dict:
    """Sérialise une image Wagtail et ses informations de crédit."""
    try:
        url = image.file.url
    except Exception:
        url = None

    license_name = None
    license_url = None
    try:
        if getattr(image, "license_id", None):
            license_obj = getattr(image, "license", None)
            license_name = getattr(license_obj, "name", None) or None
            license_url = getattr(license_obj, "url", None) or None
    except Exception:
        license_name = None
        license_url = None

    credit_text = None
    try:
        value = getattr(image, "credit_text", None)
        if callable(value):
            credit_text = value() or None
        elif value:
            credit_text = str(value)
    except Exception:
        credit_text = None

    return {
        "id": image.id,
        "title": image.title,
        "url": url,
        "credit_text": credit_text,
        "credit_source_url": getattr(image, "credit_source_url", "") or "",
        "credit_license": license_name or getattr(image, "credit_license", "") or "",
        "credit_license_url": license_url or getattr(image, "credit_license_url", "") or "",
        "credit_author": getattr(image, "credit_author", "") or "",
        "credit_source": getattr(image, "credit_source", "") or "",
    }


class MicroArticleCardSerializer(serializers.Serializer):
    """Sérialisation canonique d'une fiche utilisée par toutes les APIs.

    Le payload par défaut est volontairement celui d'une carte de liste. Les
    champs éditoriaux supplémentaires sont disponibles via ``fields`` pour
    l'adaptateur Wagtail et la vue de détail, sans alourdir les listes ni le SRS.
    """

    id = serializers.IntegerField(read_only=True)
    slug = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    answer_express = serializers.SerializerMethodField()
    takeaway = serializers.SerializerMethodField()
    key_points = serializers.SerializerMethodField()
    cover_image_url = serializers.SerializerMethodField()
    cover_image_credit = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    published_at = serializers.DateTimeField(
        source="first_published_at",
        allow_null=True,
        read_only=True,
    )

    # Champs éditoriaux sélectionnés individuellement par l'API Wagtail v2.
    sources = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    links = serializers.SerializerMethodField()
    see_more = serializers.SerializerMethodField()
    tags_payload = serializers.SerializerMethodField()
    categories_theme_payload = serializers.SerializerMethodField()
    categories_maladies_payload = serializers.SerializerMethodField()
    categories_medicament_payload = serializers.SerializerMethodField()
    categories_pharmacologie_payload = serializers.SerializerMethodField()
    questions = serializers.SerializerMethodField()
    recap_points = serializers.SerializerMethodField()
    parent_recap_cards = serializers.SerializerMethodField()

    default_fields = (
        "id",
        "slug",
        "title",
        "answer_express",
        "takeaway",
        "key_points",
        "cover_image_url",
        "cover_image_credit",
        "cover_image",
        "tags",
        "published_at",
    )

    def __init__(self, *args, fields=None, **kwargs):
        super().__init__(*args, **kwargs)
        selected = set(self.default_fields if fields is None else fields)
        for field_name in set(self.fields) - selected:
            self.fields.pop(field_name)

    @staticmethod
    def _cover_image(page):
        if not getattr(page, "cover_image_id", None):
            return None
        try:
            return page.cover_image
        except Exception:
            return None

    @staticmethod
    def _stream_data(field) -> list[dict]:
        if not field:
            return []
        # Wagtail 7 expose ``raw_data`` ; les versions précédentes utilisaient
        # ``stream_data``. Dans les deux cas on matérialise une liste JSON-like.
        raw_data = getattr(field, "raw_data", None)
        if raw_data is not None:
            return list(raw_data)
        return list(getattr(field, "stream_data", []))

    @staticmethod
    def _taxonomy_payload(queryset) -> list[dict]:
        return [
            {"id": item.id, "name": item.name, "slug": item.slug}
            for item in queryset.all()
        ]

    def get_answer_express(self, page) -> str:
        return sanitize_rich_text(page.answer_express)

    def get_takeaway(self, page) -> str:
        return sanitize_rich_text(page.takeaway)

    def get_key_points(self, page) -> list[str]:
        return [block.value for block in page.key_points]

    def get_cover_image_url(self, page) -> str | None:
        image = self._cover_image(page)
        if image is None:
            return None
        try:
            return image.file.url
        except Exception:
            return None

    def get_cover_image_credit(self, page) -> str | None:
        image = self._cover_image(page)
        if image is None:
            return None
        try:
            text = getattr(image, "credit_text", None)
            value = text() if callable(text) else (str(text) if text else "")
            return value or None
        except Exception:
            return None

    def get_cover_image(self, page) -> dict | None:
        image = self._cover_image(page)
        return image_payload(image) if image is not None else None

    def get_tags(self, page) -> list[str]:
        # ``all()`` permet aux vues de liste de profiter de leur prefetch_related.
        return [tag.name for tag in page.tags.all()]

    def get_sources(self, page) -> list[dict]:
        return self._stream_data(page.sources)

    def get_cover(self, page) -> dict | None:
        """Ancien contrat ``api_cover`` de Wagtail v2."""
        image = self._cover_image(page)
        if image is None:
            return None
        try:
            url = image.file.url
        except Exception:
            url = None
        return {"id": image.id, "title": image.title, "url": url}

    def get_links(self, page) -> list[dict]:
        return self._stream_data(page.links)

    def get_see_more(self, page) -> list[dict]:
        return self._stream_data(page.see_more)

    def get_tags_payload(self, page) -> list[dict]:
        return [
            {"id": tag.id, "name": tag.name, "slug": tag.slug}
            for tag in page.tags.all()
        ]

    def get_categories_theme_payload(self, page) -> list[dict]:
        return self._taxonomy_payload(page.categories_theme)

    def get_categories_maladies_payload(self, page) -> list[dict]:
        return self._taxonomy_payload(page.categories_maladies)

    def get_categories_medicament_payload(self, page) -> list[dict]:
        return self._taxonomy_payload(page.categories_medicament)

    def get_categories_pharmacologie_payload(self, page) -> list[dict]:
        return self._taxonomy_payload(page.categories_pharmacologie)

    def get_questions(self, page) -> list[dict]:
        rows = (
            page.microarticle_questions.select_related("question")
            .all()
            .order_by("sort_order")
        )
        return [
            {
                "id": row.question_id,
                "type": row.question.type,
                "prompt": row.question.prompt,
                "choices": row.question.choices,
                "correct_answers": row.question.correct_answers,
                "explanation": row.question.explanation,
                "difficulty": row.question.difficulty,
                "references": row.question.references,
            }
            for row in rows
        ]

    def get_recap_points(self, page) -> list[dict]:
        rows = page.recap_points.select_related("detail_card").all().order_by("sort_order")
        return [
            {
                "id": row.id,
                "text": row.text,
                "sort_order": row.sort_order,
                "detail_card": (
                    {
                        "id": row.detail_card.id,
                        "slug": row.detail_card.slug,
                        "title": row.detail_card.title,
                    }
                    if row.detail_card
                    else None
                ),
            }
            for row in rows
        ]

    def get_parent_recap_cards(self, page) -> list[dict]:
        return [
            {
                "id": row.recap_card.id,
                "slug": row.recap_card.slug,
                "title": row.recap_card.title,
            }
            for row in page.recap_point_links.select_related("recap_card")
        ]


class MicroArticleCardField(serializers.Field):
    """Expose un champ du serializer canonique dans le serializer Wagtail."""

    def __init__(self, card_field: str, **kwargs):
        self.card_field = card_field
        kwargs.setdefault("source", "*")
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)

    def to_representation(self, page):
        return MicroArticleCardSerializer(page, fields=(self.card_field,)).data[
            self.card_field
        ]


class TagPayloadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()


class ImagePayloadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    url = serializers.CharField(allow_null=True)
    credit_text = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    credit_author = serializers.CharField(allow_blank=True, required=False)
    credit_source = serializers.CharField(allow_blank=True, required=False)
    credit_source_url = serializers.CharField(allow_blank=True, required=False)
    credit_license = serializers.CharField(allow_blank=True, required=False)
    credit_license_url = serializers.CharField(allow_blank=True, required=False)


class CategoryPayloadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()


class SubjectSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField(allow_blank=True)


class SubjectDetailCardSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    label = serializers.CharField()
    sort_order = serializers.IntegerField()


class SubjectRecapCardSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()


class RecapPointSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    text = serializers.CharField()
    sort_order = serializers.IntegerField()
    detail_card = SubjectRecapCardSerializer(allow_null=True)


class ParentRecapCardSerializer(SubjectRecapCardSerializer):
    pass


class StreamBlockSerializer(serializers.Serializer):
    type = serializers.CharField()
    value = serializers.JSONField()


class QuestionPayloadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    type = serializers.CharField()
    prompt = serializers.CharField()
    choices = serializers.JSONField(required=False)
    correct_answers = serializers.JSONField(required=False)
    explanation = serializers.CharField(allow_blank=True, required=False)
    difficulty = serializers.IntegerField(required=False)
    references = serializers.JSONField(required=False)


@extend_schema_serializer(component_name="MicroArticleListItem")
class MicroArticleListSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    cover_image_credit = serializers.CharField(allow_null=True, required=False)
    cover_image = ImagePayloadSerializer(allow_null=True, required=False)
    tags = serializers.ListField(child=serializers.CharField())
    tags_payload = TagPayloadSerializer(many=True, required=False)
    categories_theme_payload = CategoryPayloadSerializer(many=True, required=False)
    categories_maladies_payload = CategoryPayloadSerializer(many=True, required=False)
    categories_medicament_payload = CategoryPayloadSerializer(many=True, required=False)
    categories_pharmacologie_payload = CategoryPayloadSerializer(many=True, required=False)
    published_at = serializers.DateTimeField(allow_null=True, required=False)
    decks_count = serializers.IntegerField(min_value=0, required=False)
    card_type = serializers.ChoiceField(choices=["standard", "recap", "detail"], required=False)
    subject = SubjectSummarySerializer(allow_null=True, required=False)


class MicroArticleDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    answer_express = serializers.CharField()
    takeaway = serializers.CharField(allow_blank=True)
    key_points = serializers.ListField(child=serializers.CharField())
    cover_image_url = serializers.CharField(allow_null=True)
    cover_image_credit = serializers.CharField(allow_null=True, required=False)
    cover_image = ImagePayloadSerializer(allow_null=True, required=False)
    links = StreamBlockSerializer(many=True, required=False)
    see_more = StreamBlockSerializer(many=True, required=False)
    is_saved = serializers.BooleanField(required=False)
    is_read = serializers.BooleanField(required=False)
    tags = serializers.ListField(child=serializers.CharField())
    categories_theme = serializers.ListField(child=serializers.CharField())
    categories_maladies = serializers.ListField(child=serializers.CharField())
    categories_medicament = serializers.ListField(child=serializers.CharField())
    categories_pharmacologie = serializers.ListField(child=serializers.CharField(), required=False)
    tags_payload = TagPayloadSerializer(many=True, required=False)
    categories_theme_payload = CategoryPayloadSerializer(many=True, required=False)
    categories_maladies_payload = CategoryPayloadSerializer(many=True, required=False)
    categories_medicament_payload = CategoryPayloadSerializer(many=True, required=False)
    categories_pharmacologie_payload = CategoryPayloadSerializer(many=True, required=False)
    questions = QuestionPayloadSerializer(many=True, required=False)
    published_at = serializers.DateTimeField(allow_null=True, required=False)
    card_type = serializers.ChoiceField(choices=["standard", "recap", "detail"], required=False)
    subject = SubjectSummarySerializer(allow_null=True, required=False)
    detail_cards = SubjectDetailCardSerializer(many=True, required=False)
    recap_card = SubjectRecapCardSerializer(allow_null=True, required=False)
    recap_points = RecapPointSerializer(many=True, required=False)
    parent_recap_cards = ParentRecapCardSerializer(many=True, required=False)
