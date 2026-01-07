from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify

from modelcluster.fields import ParentalKey, ParentalManyToManyField
from modelcluster.contrib.taggit import ClusterTaggableManager
from rest_framework import serializers
from taggit.models import TaggedItemBase
from treebeard.mp_tree import MP_Node
from wagtail import blocks
from wagtail.admin.panels import FieldPanel, InlinePanel, MultiFieldPanel
from wagtail.api import APIField
from wagtail.fields import StreamField
from wagtail.images import get_image_model_string
from wagtail.models import Orderable, Page
from wagtail.search import index
from wagtail.snippets.models import register_snippet

from .blocks import ImageWithCaptionBlock, Mechanism3StepsBlock, ReferenceBlock


@register_snippet
class Question(models.Model):
    class QuestionType(models.TextChoices):
        QCM = "qcm", "QCM"
        TRUE_FALSE = "true_false", "Vrai/Faux"

    type = models.CharField(max_length=32, choices=QuestionType.choices)
    prompt = models.CharField(max_length=500)
    choices = models.JSONField(blank=True, null=True)
    correct_answers = models.JSONField(blank=True, null=True)
    explanation = models.TextField(blank=True)
    difficulty = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], default=3
    )
    references = models.JSONField(blank=True, null=True)

    panels = [
        FieldPanel("type"),
        FieldPanel("prompt"),
        FieldPanel("choices"),
        FieldPanel("correct_answers"),
        FieldPanel("explanation"),
        FieldPanel("difficulty"),
        FieldPanel("references"),
    ]

    def __str__(self) -> str:
        return self.prompt


class BaseCategory(MP_Node):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)

    node_order_by = ["name"]

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
    ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        # MP_Node requires using add_root/add_child to populate path/depth.
        # When creating a new snippet from the Wagtail admin there is no
        # parent selection, so treat it as a root node.
        if not self.pk and not getattr(self, "path", None):
            node = type(self).add_root(name=self.name, slug=self.slug)
            # sync generated fields back onto self so Wagtail logging sees a PK
            self.pk = node.pk
            self.path = node.path
            self.depth = node.depth
            self.numchild = node.numchild
            self._state.adding = False
            return node
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


@register_snippet
class CategoryPharmacologie(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories pharmacologie"


@register_snippet
class CategoryMaladies(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories maladies"


@register_snippet
class CategoryClasses(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories classes"


class MicroArticleIndexPage(Page):
    max_count = 1

    subpage_types = ["content.MicroArticlePage"]


class MicroArticlePageTag(TaggedItemBase):
    content_object = ParentalKey(
        "content.MicroArticlePage",
        related_name="tagged_items",
        on_delete=models.CASCADE,
    )


class MicroArticleQuestion(Orderable):
    page = ParentalKey(
        "content.MicroArticlePage",
        related_name="microarticle_questions",
        on_delete=models.CASCADE,
    )
    question = models.ForeignKey(
        "content.Question",
        on_delete=models.CASCADE,
        related_name="linked_microarticles",
    )

    panels = [
        FieldPanel("question"),
    ]


class MicroArticlePage(Page):
    title_question = models.CharField(max_length=160)
    answer_express = models.TextField(
        blank=True,
        help_text="Réponse courte recommandée (~350 caractères), non bloquante.",
    )
    answer_detail = models.TextField(
        blank=True,
        null=True,
        help_text="Réponse longue optionnelle pour approfondir.",
    )
    key_points = StreamField(
        [("point", blocks.CharBlock(max_length=90))],
        use_json_field=True,
        blank=True,
    )
    takeaway = models.CharField(max_length=140, blank=True)
    cover_image = models.ForeignKey(
        get_image_model_string(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="microarticle_covers",
    )
    links = StreamField(
        [
            (
                "link",
                blocks.StructBlock(
                    [
                        ("title", blocks.CharBlock(max_length=120)),
                        ("url", blocks.URLBlock()),
                        (
                            "type",
                            blocks.CharBlock(max_length=40, required=False),
                        ),
                        ("source", blocks.CharBlock(max_length=120, required=False)),
                        ("date", blocks.DateBlock(required=False)),
                    ]
                ),
            )
        ],
        use_json_field=True,
        blank=True,
        max_num=5,
    )
    related_articles = ParentalManyToManyField(
        "self",
        blank=True,
        symmetrical=False,
        related_name="related_to",
    )

    see_more = StreamField(
        [
            (
                "detail",
                blocks.RichTextBlock(features=["bold", "italic", "link"], required=True),
            ),
            ("mechanism_3_steps", Mechanism3StepsBlock()),
            (
                "indications",
                blocks.ListBlock(blocks.CharBlock(max_length=120), min_num=1, max_num=8),
            ),
            (
                "adverse_effects",
                blocks.ListBlock(blocks.CharBlock(max_length=120), min_num=1, max_num=8),
            ),
            (
                "warnings",
                blocks.ListBlock(blocks.CharBlock(max_length=140), min_num=1, max_num=8),
            ),
            (
                "interactions",
                blocks.ListBlock(blocks.CharBlock(max_length=140), min_num=1, max_num=8),
            ),
            (
                "monitoring",
                blocks.StructBlock(
                    [
                        ("what", blocks.CharBlock(max_length=140)),
                        ("why", blocks.CharBlock(max_length=200)),
                    ]
                ),
            ),
            ("image", ImageWithCaptionBlock()),
            (
                "references",
                blocks.ListBlock(ReferenceBlock(), min_num=1, max_num=8),
            ),
            ("final_summary", blocks.CharBlock(max_length=220)),
        ],
        use_json_field=True,
        blank=True,
    )

    categories_pharmacologie = ParentalManyToManyField(
        "content.CategoryPharmacologie",
        blank=True,
        related_name="microarticles",
    )
    categories_maladies = ParentalManyToManyField(
        "content.CategoryMaladies",
        blank=True,
        related_name="microarticles",
    )
    categories_classes = ParentalManyToManyField(
        "content.CategoryClasses",
        blank=True,
        related_name="microarticles",
    )

    tags = ClusterTaggableManager(through=MicroArticlePageTag, blank=True)

    content_panels = Page.content_panels + [
        MultiFieldPanel(
            [
                FieldPanel("title_question"),
                FieldPanel("answer_express"),
                FieldPanel("answer_detail"),
                FieldPanel("key_points"),
                FieldPanel("takeaway"),
                FieldPanel("cover_image"),
                FieldPanel("links"),
                FieldPanel("related_articles"),
            ],
            heading="Feed",
        ),
        MultiFieldPanel(
            [
                FieldPanel("see_more"),
            ],
            heading="Voir plus",
        ),
        MultiFieldPanel(
            [
                FieldPanel("categories_pharmacologie"),
                FieldPanel("categories_maladies"),
                FieldPanel("categories_classes"),
                FieldPanel("tags"),
            ],
            heading="Catégorisation",
        ),
        MultiFieldPanel(
            [
                InlinePanel("microarticle_questions", label="Questions"),
            ],
            heading="Questions associées",
        ),
    ]

    search_fields = Page.search_fields + [
        index.SearchField("title_question"),
        index.SearchField("answer_express"),
    ]

    def api_key_points(self) -> list[str]:
        return [block.value for block in self.key_points]

    def api_cover(self) -> dict | None:
        if not self.cover_image_id:
            return None
        try:
            return {
                "id": self.cover_image_id,
                "title": self.cover_image.title,
                "url": self.cover_image.file.url,
            }
        except Exception:
            return {"id": self.cover_image_id, "title": self.cover_image.title, "url": None}

    def api_links(self) -> list[dict]:
        return self.links.stream_data if self.links else []

    def api_see_more(self) -> list[dict]:
        return self.see_more.stream_data if self.see_more else []

    def api_tags(self) -> list[dict]:
        return [{"id": t.id, "name": t.name, "slug": t.slug} for t in self.tags.all()]

    def api_categories_pharmacologie(self) -> list[dict]:
        return [
            {"id": c.id, "name": c.name, "slug": c.slug}
            for c in self.categories_pharmacologie.all()
        ]

    def api_categories_maladies(self) -> list[dict]:
        return [{"id": c.id, "name": c.name, "slug": c.slug} for c in self.categories_maladies.all()]

    def api_categories_classes(self) -> list[dict]:
        return [{"id": c.id, "name": c.name, "slug": c.slug} for c in self.categories_classes.all()]

    def api_questions(self) -> list[dict]:
        rows = (
            self.microarticle_questions.select_related("question")
            .all()
            .order_by("sort_order")
        )
        return [
            {
                "id": r.question_id,
                "type": r.question.type,
                "prompt": r.question.prompt,
                "choices": r.question.choices,
                "correct_answers": r.question.correct_answers,
                "explanation": r.question.explanation,
                "difficulty": r.question.difficulty,
                "references": r.question.references,
            }
            for r in rows
        ]

    api_fields = [
        APIField("title_question"),
        APIField("answer_express"),
        APIField("takeaway"),
        APIField("api_key_points", serializer=serializers.ListField(child=serializers.CharField())),
        APIField("api_cover", serializer=serializers.DictField(allow_null=True)),
        APIField("api_links", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("api_see_more", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("api_tags", serializer=serializers.ListField(child=serializers.DictField())),
        APIField(
            "api_categories_pharmacologie",
            serializer=serializers.ListField(child=serializers.DictField()),
        ),
        APIField(
            "api_categories_maladies",
            serializer=serializers.ListField(child=serializers.DictField()),
        ),
        APIField(
            "api_categories_classes",
            serializer=serializers.ListField(child=serializers.DictField()),
        ),
        APIField("api_questions", serializer=serializers.ListField(child=serializers.DictField())),
    ]

    parent_page_types = ["content.MicroArticleIndexPage"]
    subpage_types = []

    def clean(self):
        super().clean()
        if self.see_more and len(self.see_more) > 3:
            raise ValidationError({"see_more": "Max 3 blocs."})

        if self.links and len(self.links) > 5:
            raise ValidationError({"links": "Max 5 liens."})

    def save(self, *args, **kwargs):
        # Normalise systématiquement le slug pour supprimer les accents/espaces.
        base_slug = self.slug or self.title_question
        if base_slug:
            self.slug = slugify(base_slug)
        return super().save(*args, **kwargs)
