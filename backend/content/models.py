from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils.text import slugify

from modelcluster.fields import ParentalKey, ParentalManyToManyField
from modelcluster.contrib.taggit import ClusterTaggableManager
from modelcluster.models import ClusterableModel
from rest_framework import serializers
from taggit.models import TaggedItemBase
from treebeard.mp_tree import MP_Node
from wagtail import blocks
from wagtail.admin.panels import FieldPanel, InlinePanel, MultiFieldPanel, PageChooserPanel
from wagtail.api import APIField
from wagtail.fields import RichTextField, StreamField
from wagtail.images.models import AbstractImage, AbstractRendition, Image
from wagtail.images import get_image_model_string
from wagtail.models import Orderable, Page
from wagtail.search import index
from wagtail.snippets.models import register_snippet
from wagtail.snippets.widgets import AdminSnippetChooser
from wagtail.admin.widgets import AdminPageChooser

from .blocks import ImageWithCaptionBlock, LandingCardBlock, LandingStepBlock, Mechanism3StepsBlock, ReferenceBlock


class PathologyThumbOverride(models.Model):
    class Pattern(models.TextChoices):
        WAVES = "waves", "waves"
        CHEVRONS = "chevrons", "chevrons"
        DOTS = "dots", "dots"
        VLINES = "vlines", "vlines"
        DIAGONALS = "diagonals", "diagonals"
        GRID = "grid", "grid"
        CROSSHATCH = "crosshatch", "crosshatch"
        RINGS = "rings", "rings"
        PLUSES = "pluses", "pluses"
        TRIANGLES = "triangles", "triangles"

    pathology_slug = models.SlugField(max_length=140, unique=True)
    bg = models.CharField(max_length=20)
    accent = models.CharField(max_length=20)
    pattern = models.CharField(max_length=20, choices=Pattern.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Override vignette pathologie"
        verbose_name_plural = "Overrides vignettes pathologies"

    def __str__(self) -> str:
        return self.pathology_slug


@register_snippet
class ImageLicense(models.Model):
    name = models.CharField(max_length=120, unique=True)
    url = models.URLField(blank=True)
    code = models.CharField(
        max_length=50,
        blank=True,
        help_text="Facultatif (ex: CC-BY-4.0). Sert pour l'auto-complétion / filtres.",
    )

    panels = [
        FieldPanel("name"),
        FieldPanel("url"),
        FieldPanel("code"),
    ]

    class Meta:
        verbose_name = "Licence d'image"
        verbose_name_plural = "Licences d'image"

    def __str__(self) -> str:
        return self.name


class CustomImage(AbstractImage):
    credit_author = models.CharField(max_length=200, blank=True)
    credit_source = models.CharField(max_length=200, blank=True)
    credit_source_url = models.URLField(blank=True)
    credit_license = models.CharField(max_length=120, blank=True)
    credit_license_url = models.URLField(blank=True)
    license = models.ForeignKey(
        "content.ImageLicense",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="images",
        help_text="Choisir une licence préremplie (prioritaire sur le champ texte ci-dessus).",
    )

    admin_form_fields = Image.admin_form_fields + (
        "credit_author",
        "credit_source",
        "credit_source_url",
        "credit_license",
        "credit_license_url",
        "license",
    )

    def credit_text(self) -> str:
        license_label = self.license.name if self.license_id else self.credit_license
        parts = [p for p in [self.credit_author, self.credit_source, license_label] if p]
        return " · ".join(parts)


class CustomRendition(AbstractRendition):
    image = models.ForeignKey(
        "content.CustomImage",
        on_delete=models.CASCADE,
        related_name="renditions",
    )

    class Meta:
        unique_together = (("image", "filter_spec", "focal_point_key"),)


@register_snippet
class Question(index.Indexed, models.Model):
    class QuestionType(models.TextChoices):
        QCM = "qcm", "QCM"
        TRUE_FALSE = "true_false", "Vrai/Faux"

    class TrueFalseCorrect(models.TextChoices):
        UNSET = "", "—"
        TRUE = "true", "Vrai"
        FALSE = "false", "Faux"

    type = models.CharField(max_length=32, choices=QuestionType.choices)
    prompt = models.CharField(max_length=500)
    qcm_answer_1 = models.CharField(max_length=200, blank=True)
    qcm_answer_2 = models.CharField(max_length=200, blank=True)
    qcm_answer_3 = models.CharField(max_length=200, blank=True)
    qcm_answer_4 = models.CharField(max_length=200, blank=True)
    true_false_correct = models.CharField(
        max_length=8,
        choices=TrueFalseCorrect.choices,
        blank=True,
        default=TrueFalseCorrect.UNSET,
    )
    source = models.ForeignKey(
        "content.Source",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="questions",
    )
    choices = models.JSONField(blank=True, null=True, editable=False)
    correct_answers = models.JSONField(blank=True, null=True, editable=False)
    explanation = models.TextField(blank=True)
    difficulty = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], default=3
    )
    references = models.JSONField(blank=True, null=True, editable=False)

    search_fields = [
        index.SearchField("prompt"),
        index.SearchField("explanation"),
        index.AutocompleteField("prompt"),
        index.AutocompleteField("explanation"),
    ]

    admin_search_fields = ["prompt", "explanation"]

    class Meta:
        ordering = ["prompt", "id"]

    def _derive_qcm_choices(self) -> list[str]:
        return [
            (self.qcm_answer_1 or "").strip(),
            (self.qcm_answer_2 or "").strip(),
            (self.qcm_answer_3 or "").strip(),
            (self.qcm_answer_4 or "").strip(),
        ]

    def _serialize_source(self) -> dict | None:
        if not self.source_id:
            return None
        try:
            s = self.source
        except Exception:
            return None
        return {
            "id": s.id,
            "name": s.name,
            "kind": s.kind,
            "url": s.url,
            "publisher": s.publisher,
            "author": s.author,
            "publication_date": s.publication_date.isoformat() if s.publication_date else None,
            "accessed_date": s.accessed_date.isoformat() if s.accessed_date else None,
            "notes": s.notes,
        }

    def _sync_references(self) -> None:
        src = self._serialize_source()
        self.references = [src] if src else None

    def _sync_legacy_json_fields(self) -> None:
        if self.type == self.QuestionType.QCM:
            self.choices = self._derive_qcm_choices()
            self.correct_answers = [0]
            return

        if self.type == self.QuestionType.TRUE_FALSE:
            if self.true_false_correct == self.TrueFalseCorrect.TRUE:
                self.choices = ["Vrai", "Faux"]
                self.correct_answers = [0]
                return
            if self.true_false_correct == self.TrueFalseCorrect.FALSE:
                self.choices = ["Faux", "Vrai"]
                self.correct_answers = [0]
                return

            self.choices = None
            self.correct_answers = None
            return

        self.choices = None
        self.correct_answers = None

    def clean(self):
        super().clean()

        if self.type == self.QuestionType.QCM:
            a1 = (self.qcm_answer_1 or "").strip()
            a2 = (self.qcm_answer_2 or "").strip()
            a3 = (self.qcm_answer_3 or "").strip()
            a4 = (self.qcm_answer_4 or "").strip()
            errors: dict[str, str] = {}
            if not a1:
                errors["qcm_answer_1"] = "Réponse 1 obligatoire (bonne réponse)."
            if not a2:
                errors["qcm_answer_2"] = "Réponse 2 obligatoire."
            if not a3:
                errors["qcm_answer_3"] = "Réponse 3 obligatoire."
            if not a4:
                errors["qcm_answer_4"] = "Réponse 4 obligatoire."
            if errors:
                raise ValidationError(errors)

            self._sync_legacy_json_fields()
            self._sync_references()
            return

        if self.type == self.QuestionType.TRUE_FALSE:
            if self.true_false_correct not in (
                self.TrueFalseCorrect.TRUE,
                self.TrueFalseCorrect.FALSE,
            ):
                raise ValidationError({"true_false_correct": "Choisir Vrai ou Faux."})

            self._sync_legacy_json_fields()
            self._sync_references()
            return

        self._sync_legacy_json_fields()
        self._sync_references()

    def save(self, *args, **kwargs):
        self._sync_legacy_json_fields()
        self._sync_references()
        return super().save(*args, **kwargs)

    panels = [
        FieldPanel("type"),
        FieldPanel("prompt"),
        MultiFieldPanel(
            [
                FieldPanel("qcm_answer_1"),
                FieldPanel("qcm_answer_2"),
                FieldPanel("qcm_answer_3"),
                FieldPanel("qcm_answer_4"),
            ],
            heading="Réponses QCM (bonne en 1ère position)",
        ),
        MultiFieldPanel(
            [
                FieldPanel("true_false_correct"),
            ],
            heading="Vrai/Faux (bonne réponse)",
        ),
        FieldPanel("source"),
        FieldPanel("explanation"),
        FieldPanel("difficulty"),
    ]

    def __str__(self) -> str:
        return self.prompt


@register_snippet
class Source(index.Indexed, models.Model):
    class SourceKind(models.TextChoices):
        PRESS = "press", "Presse professionnelle"
        INSTITUTIONAL = "institutional", "Site institutionnel"
        BOOK = "book", "Livre"
        SCIENTIFIC = "article", "Article scientifique"
        THESIS = "thesis", "Thèse"
        LAB_INFORMATION = "lab_information", "Information laboratoire"
        OTHER = "other", "Autre"

    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=32, choices=SourceKind.choices, blank=True)
    url = models.URLField(blank=True)
    publisher = models.CharField(max_length=200, blank=True)
    author = models.CharField(max_length=200, blank=True)
    publication_date = models.DateField(blank=True, null=True)
    accessed_date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True)

    panels = [
        FieldPanel("name"),
        FieldPanel("kind"),
        FieldPanel("url"),
        FieldPanel("publisher"),
        FieldPanel("author"),
        FieldPanel("publication_date"),
        FieldPanel("accessed_date"),
        FieldPanel("notes"),
    ]

    search_fields = [
        index.SearchField("name"),
        index.SearchField("publisher"),
        index.SearchField("author"),
    ]

    def __str__(self) -> str:
        label_parts = [p for p in [self.publisher, self.author] if p]
        prefix = " · ".join(label_parts)
        return " — ".join([p for p in [prefix, self.name] if p])


class BaseCategory(index.Indexed, MP_Node):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)

    node_order_by = ["name"]

    search_fields = [
        index.SearchField("name"),
        index.SearchField("slug"),
    ]

    class Meta:
        abstract = True

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
class CategoryTheme(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories"


@register_snippet
class CategoryMaladies(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories maladies"

    def __str__(self) -> str:
        return self.name


@register_snippet
class CategoryMedicament(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories médicaments"
        verbose_name = "Catégorie médicament"


@register_snippet
class CategoryPharmacologie(BaseCategory):
    class Meta:
        verbose_name_plural = "Catégories pharmacologie"
        verbose_name = "Catégorie pharmacologie"


class MicroArticleIndexPage(Page):
    max_count = 1

    subpage_types = ["content.MicroArticlePage"]


class LandingPage(Page):
    max_count = 1

    hero_title = models.CharField(max_length=120, blank=True)
    hero_subtitle = models.TextField(blank=True)
    hero_bullets = StreamField(
        [("bullet", blocks.CharBlock(max_length=90))],
        use_json_field=True,
        blank=True,
    )
    steps = StreamField(
        [("step", LandingStepBlock())],
        use_json_field=True,
        blank=True,
        max_num=3,
    )
    cards = StreamField(
        [("card", LandingCardBlock())],
        use_json_field=True,
        blank=True,
    )

    primary_cta_label = models.CharField(max_length=40, blank=True, default="Commencer")
    primary_cta_target = models.CharField(
        max_length=32,
        choices=[
            ("start", "Commencer"),
            ("discover", "Dose du jour"),
            ("cards", "Mes cartes"),
            ("review", "Révision"),
            ("quiz", "Quiz"),
        ],
        default="start",
    )
    secondary_cta_label = models.CharField(max_length=40, blank=True, default="")
    secondary_cta_target = models.CharField(
        max_length=32,
        choices=[
            ("", "—"),
            ("start", "Commencer"),
            ("discover", "Dose du jour"),
            ("cards", "Mes cartes"),
            ("review", "Révision"),
            ("quiz", "Quiz"),
        ],
        blank=True,
        default="",
    )

    content_panels = Page.content_panels + [
        MultiFieldPanel(
            [
                FieldPanel("hero_title"),
                FieldPanel("hero_subtitle"),
                FieldPanel("hero_bullets"),
                FieldPanel("steps"),
                FieldPanel("cards"),
            ],
            heading="Landing",
        ),
        MultiFieldPanel(
            [
                FieldPanel("primary_cta_label"),
                FieldPanel("primary_cta_target"),
                FieldPanel("secondary_cta_label"),
                FieldPanel("secondary_cta_target"),
            ],
            heading="Boutons",
        ),
    ]

    api_fields = [
        APIField("title"),
        APIField("hero_title"),
        APIField("hero_subtitle"),
        APIField("hero_bullets", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("steps", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("cards", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("primary_cta_label"),
        APIField("primary_cta_target"),
        APIField("secondary_cta_label"),
        APIField("secondary_cta_target"),
    ]

    parent_page_types = ["wagtailcore.Page"]
    subpage_types: list[str] = []


class CardType(models.TextChoices):
    STANDARD = "standard", "Standard"
    RECAP = "recap", "Récap"
    DETAIL = "detail", "Détail"


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
        FieldPanel("question", widget=AdminSnippetChooser(Question)),
    ]


class RecapPoint(Orderable):
    """Point d'une fiche récap, avec lien optionnel vers une fiche détail."""

    recap_card = ParentalKey(
        "content.MicroArticlePage",
        on_delete=models.CASCADE,
        related_name="recap_points",
    )
    text = models.CharField(
        max_length=200,
        help_text="Texte du point (ex: 'utilisation d'une contraception').",
    )
    detail_card = models.ForeignKey(
        "content.MicroArticlePage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recap_point_links",
        help_text="Fiche détail associée (optionnel).",
    )

    panels = [
        FieldPanel("text"),
        PageChooserPanel("detail_card", ["content.MicroArticlePage"]),
    ]

    class Meta(Orderable.Meta):
        verbose_name = "Point récap"
        verbose_name_plural = "Points récap"

    def __str__(self):
        return self.text[:50]


class MicroArticlePage(Page):
    card_type = models.CharField(
        max_length=16,
        choices=CardType.choices,
        default=CardType.STANDARD,
        help_text="Type de carte : standard, récap (vue d'ensemble), ou détail (atomique).",
    )
    answer_express = RichTextField(
        features=["bold", "italic", "link", "ol", "ul"],
        blank=True,
        help_text=(
            "Reponse courte optionnelle, recommandee (~350 caracteres). "
            "Compteur affiche dans l'admin Wagtail. "
            "RichText autorise (gras/italique/liens/listes)."
        ),
    )
    answer_detail = RichTextField(
        features=["bold", "italic", "link", "ol", "ul"],
        blank=True,
        null=True,
        help_text="Réponse longue optionnelle pour approfondir (RichText).",
    )
    key_points = StreamField(
        [("point", blocks.CharBlock(max_length=90))],
        use_json_field=True,
        blank=True,
    )
    sources = StreamField(
        [("reference", ReferenceBlock())],
        use_json_field=True,
        blank=True,
        min_num=1,
        default=[("reference", {})],
        max_num=5,
        help_text="Sources principales de l'article (max 5). Un bloc vide est préajouté."
    )
    takeaway = RichTextField(
        features=["bold", "italic", "link", "ol", "ul"],
        blank=True,
        help_text="Résumé essentiel (peut contenir gras/italique/liens/listes).",
    )
    cover_image = models.ForeignKey(
        get_image_model_string(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="microarticle_covers",
        verbose_name="Illustration",
        help_text="Illustration principale optionnelle (unique) affichée après la réponse courte.",
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

    categories_theme = ParentalManyToManyField(
        "content.CategoryTheme",
        related_name="microarticles",
    )
    categories_maladies = ParentalManyToManyField(
        "content.CategoryMaladies",
        blank=True,
        related_name="microarticles",
    )
    categories_medicament = ParentalManyToManyField(
        "content.CategoryMedicament",
        blank=True,
        related_name="microarticles",
    )

    categories_pharmacologie = ParentalManyToManyField(
        "content.CategoryPharmacologie",
        blank=True,
        related_name="microarticles",
    )

    tags = ClusterTaggableManager(through=MicroArticlePageTag, blank=True)

    content_panels = Page.content_panels + [
        FieldPanel("card_type"),
        MultiFieldPanel(
            [
                InlinePanel("recap_points", label="Points récap"),
            ],
            heading="Points récap (pour cartes récap uniquement)",
            classname="collapsed",
        ),
        MultiFieldPanel(
            [
                FieldPanel("answer_express"),
                FieldPanel("answer_detail"),
                FieldPanel("key_points"),
                FieldPanel("sources"),
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
                FieldPanel("categories_theme"),
                FieldPanel("categories_maladies"),
                FieldPanel("categories_medicament"),
                FieldPanel("categories_pharmacologie"),
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
        index.SearchField("title"),
        index.SearchField("answer_express"),
    ]

    def api_key_points(self) -> list[str]:
        return [block.value for block in self.key_points]

    def api_sources(self) -> list[dict]:
        return self.sources.stream_data if self.sources else []

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

    def api_categories_theme(self) -> list[dict]:
        return [
            {"id": c.id, "name": c.name, "slug": c.slug}
            for c in self.categories_theme.all()
        ]

    def api_categories_maladies(self) -> list[dict]:
        return [{"id": c.id, "name": c.name, "slug": c.slug} for c in self.categories_maladies.all()]

    def api_categories_medicament(self) -> list[dict]:
        return [{"id": c.id, "name": c.name, "slug": c.slug} for c in self.categories_medicament.all()]

    def api_categories_pharmacologie(self) -> list[dict]:
        return [
            {"id": c.id, "name": c.name, "slug": c.slug}
            for c in self.categories_pharmacologie.all()
        ]

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

    def api_recap_points(self) -> list[dict]:
        """Retourne les points récap avec leur fiche détail associée."""
        rows = (
            self.recap_points.select_related("detail_card")
            .all()
            .order_by("sort_order")
        )
        return [
            {
                "id": r.id,
                "text": r.text,
                "sort_order": r.sort_order,
                "detail_card": {
                    "id": r.detail_card.id,
                    "slug": r.detail_card.slug,
                    "title": r.detail_card.title,
                } if r.detail_card else None,
            }
            for r in rows
        ]

    def get_parent_recap_cards(self) -> list:
        """Retourne les fiches récap qui référencent cette carte comme détail."""
        from .models import RecapPoint
        return [
            {
                "id": rp.recap_card.id,
                "slug": rp.recap_card.slug,
                "title": rp.recap_card.title,
            }
            for rp in RecapPoint.objects.filter(detail_card=self).select_related("recap_card")
        ]

    api_fields = [
        APIField("title"),
        APIField("answer_express"),
        APIField("takeaway"),
        APIField("api_key_points", serializer=serializers.ListField(child=serializers.CharField())),
        APIField("api_sources", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("api_cover", serializer=serializers.DictField(allow_null=True)),
        APIField("api_links", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("api_see_more", serializer=serializers.ListField(child=serializers.DictField())),
        APIField("api_tags", serializer=serializers.ListField(child=serializers.DictField())),
        APIField(
            "api_categories_theme",
            serializer=serializers.ListField(child=serializers.DictField()),
        ),
        APIField(
            "api_categories_maladies",
            serializer=serializers.ListField(child=serializers.DictField()),
        ),
        APIField(
            "api_categories_medicament",
            serializer=serializers.ListField(child=serializers.DictField()),
        ),
        APIField(
            "api_categories_pharmacologie",
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
        base_slug = self.slug or self.title
        if base_slug:
            self.slug = slugify(base_slug)
        return super().save(*args, **kwargs)


class SavedMicroArticle(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_microarticles",
    )
    microarticle = models.ForeignKey(
        "content.MicroArticlePage",
        on_delete=models.CASCADE,
        related_name="saved_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "microarticle"],
                name="uniq_saved_microarticle_user_microarticle",
            )
        ]
        indexes = [
            models.Index(fields=["user", "created_at"]),
        ]


class Deck(ClusterableModel):
    class DeckType(models.TextChoices):
        USER = "user", "User"
        OFFICIAL = "official", "Official"

    class Difficulty(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    type = models.CharField(max_length=16, choices=DeckType.choices, default=DeckType.USER)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="decks",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=60)
    description = models.TextField(blank=True, default="")
    cover_image = models.ForeignKey(
        get_image_model_string(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deck_covers",
        verbose_name="Illustration",
    )
    difficulty = models.CharField(max_length=16, choices=Difficulty.choices, blank=True, default="")
    estimated_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PUBLISHED)
    is_default = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    source_pack = models.ForeignKey(
        "content.Deck",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="copied_user_decks",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    panels = [
        MultiFieldPanel(
            [
                FieldPanel("type"),
                FieldPanel("status"),
                FieldPanel("user"),
                FieldPanel("name"),
            ],
            heading="Identité",
        ),
        MultiFieldPanel(
            [
                FieldPanel("description"),
                FieldPanel("cover_image"),
                FieldPanel("difficulty"),
                FieldPanel("estimated_minutes"),
            ],
            heading="Métadonnées",
        ),
        MultiFieldPanel(
            [
                FieldPanel("is_default"),
                FieldPanel("sort_order"),
                FieldPanel("source_pack"),
            ],
            heading="Affichage",
        ),
        MultiFieldPanel(
            [
                InlinePanel("deck_subjects", label="Sujets"),
            ],
            heading="Sujets",
        ),
        MultiFieldPanel(
            [
                InlinePanel("deck_cards", label="Cartes"),
            ],
            heading="Cartes",
        ),
    ]

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="uniq_deck_user_name",
            ),
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(is_default=True, type="user"),
                name="uniq_deck_default_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "sort_order"]),
        ]

    def clean(self):
        super().clean()

        if self.type == self.DeckType.OFFICIAL:
            if self.user_id is not None:
                raise ValidationError({"user": "Official decks must not have an owner."})
            if self.is_default:
                raise ValidationError({"is_default": "Official decks cannot be default."})
            if self.source_pack_id is not None:
                raise ValidationError({"source_pack": "Official decks cannot have a source pack."})
            return

        if self.type == self.DeckType.USER:
            if self.user_id is None:
                raise ValidationError({"user": "User decks must have an owner."})
            if self.source_pack_id is not None:
                src = Deck.objects.filter(id=self.source_pack_id).only("id", "type").first()
                if src is None or src.type != Deck.DeckType.OFFICIAL:
                    raise ValidationError({"source_pack": "source_pack must reference an official deck."})
            return

    def __str__(self) -> str:
        return f"{self.name} ({self.type}:{self.user_id})"


class PackManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(type="official")


@register_snippet
class Pack(Deck):
    objects = PackManager()

    panels = [
        MultiFieldPanel(
            [
                FieldPanel("status"),
                FieldPanel("name"),
            ],
            heading="Identité",
        ),
        MultiFieldPanel(
            [
                FieldPanel("description"),
                FieldPanel("cover_image"),
                FieldPanel("difficulty"),
                FieldPanel("estimated_minutes"),
            ],
            heading="Métadonnées",
        ),
        MultiFieldPanel(
            [
                FieldPanel("sort_order"),
            ],
            heading="Affichage",
        ),
        MultiFieldPanel(
            [
                InlinePanel("deck_subjects", label="Sujets"),
            ],
            heading="Sujets",
        ),
        MultiFieldPanel(
            [
                InlinePanel("deck_cards", label="Cartes"),
            ],
            heading="Cartes",
        ),
    ]

    class Meta:
        proxy = True
        verbose_name = "Pack"
        verbose_name_plural = "Packs"

    def save(self, *args, **kwargs):
        self.type = self.DeckType.OFFICIAL
        self.user_id = None
        self.is_default = False
        return super().save(*args, **kwargs)


class DeckCard(Orderable):
    deck = ParentalKey(
        "content.Deck",
        on_delete=models.CASCADE,
        related_name="deck_cards",
    )
    microarticle = models.ForeignKey(
        "content.MicroArticlePage",
        on_delete=models.CASCADE,
        related_name="deck_links",
    )
    is_optional = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")
    added_at = models.DateTimeField(auto_now_add=True)

    panels = [
        PageChooserPanel("microarticle", page_type="content.MicroArticlePage"),
        FieldPanel("is_optional"),
        FieldPanel("notes"),
    ]

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["deck", "microarticle"],
                name="uniq_deck_card",
            )
        ]
        indexes = [
            models.Index(fields=["deck", "added_at"]),
            models.Index(fields=["deck", "sort_order"], name="content_dec_deck_id_sort_idx"),
            models.Index(fields=["microarticle"]),
        ]


class UserDeckProgress(models.Model):
    class ProgressMode(models.TextChoices):
        ORDERED = "ordered", "Ordered"
        SHUFFLE = "shuffle", "Shuffle"
        DUE_ONLY = "due_only", "Due only"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="deck_progress",
    )
    deck = models.ForeignKey(
        "content.Deck",
        on_delete=models.CASCADE,
        related_name="user_progress",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    cards_seen_count = models.PositiveIntegerField(default=0)
    cards_done_count = models.PositiveIntegerField(default=0)
    mode_last = models.CharField(
        max_length=16,
        choices=ProgressMode.choices,
        default=ProgressMode.ORDERED,
    )
    last_card = models.ForeignKey(
        "content.MicroArticlePage",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="last_seen_in_deck_progress",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "deck"],
                name="uniq_user_deck_progress",
            )
        ]
        indexes = [
            models.Index(fields=["user", "deck"]),
            models.Index(fields=["user", "last_seen_at"]),
        ]


class MicroArticleReadState(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="microarticle_read_states",
    )
    microarticle = models.ForeignKey(
        "content.MicroArticlePage",
        on_delete=models.CASCADE,
        related_name="read_states",
    )
    is_read = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "microarticle"],
                name="uniq_microarticle_read_state_user_microarticle",
            )
        ]
        indexes = [
            models.Index(fields=["user", "updated_at"]),
        ]


@register_snippet
class Subject(index.Indexed, ClusterableModel):
    """
    Sujet/dossier intermédiaire entre Pack et Cards.
    Regroupe 0..1 fiche récap + N fiches détails.
    Peut être rattaché à plusieurs Packs.
    """

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    search_fields = [
        index.SearchField("name"),
        index.SearchField("slug"),
        index.SearchField("description"),
        index.AutocompleteField("name"),
    ]

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
        FieldPanel("description"),
        InlinePanel("subject_cards", label="Cartes du sujet"),
    ]

    class Meta:
        ordering = ["name"]
        verbose_name = "Sujet"
        verbose_name_plural = "Sujets"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name

    def get_recap_card(self):
        """Retourne la carte récap si elle existe, sinon None."""
        link = self.subject_cards.filter(
            microarticle__card_type=CardType.RECAP
        ).select_related("microarticle").first()
        return link.microarticle if link else None

    def get_detail_cards(self):
        """Retourne les cartes détails ordonnées."""
        return [
            sc.microarticle
            for sc in self.subject_cards.filter(
                microarticle__card_type=CardType.DETAIL
            ).select_related("microarticle").order_by("sort_order")
        ]

    def get_all_cards(self):
        """Retourne toutes les cartes du sujet ordonnées."""
        return [
            sc.microarticle
            for sc in self.subject_cards.select_related("microarticle").order_by("sort_order")
        ]


class SubjectCard(Orderable):
    """
    Relation Subject ↔ MicroArticlePage avec ordre et label.
    """

    subject = ParentalKey(
        "content.Subject",
        on_delete=models.CASCADE,
        related_name="subject_cards",
    )
    microarticle = models.ForeignKey(
        "content.MicroArticlePage",
        on_delete=models.CASCADE,
        related_name="subject_links",
    )
    label = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="Nom court du point (affiché dans la liste récap).",
    )

    panels = [
        PageChooserPanel("microarticle", page_type="content.MicroArticlePage"),
        FieldPanel("label"),
    ]

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["subject", "microarticle"],
                name="uniq_subject_card",
            )
        ]
        indexes = [
            models.Index(fields=["subject", "sort_order"]),
            models.Index(fields=["microarticle"]),
        ]

    def __str__(self) -> str:
        return f"{self.subject.name} → {self.microarticle.title}"


class DeckSubject(Orderable):
    """
    Relation Deck/Pack ↔ Subject (many-to-many avec ordre).
    """

    deck = ParentalKey(
        "content.Deck",
        on_delete=models.CASCADE,
        related_name="deck_subjects",
    )
    subject = models.ForeignKey(
        "content.Subject",
        on_delete=models.CASCADE,
        related_name="deck_links",
    )

    panels = [
        FieldPanel("subject"),
    ]

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["deck", "subject"],
                name="uniq_deck_subject",
            )
        ]
        indexes = [
            models.Index(fields=["deck", "sort_order"]),
            models.Index(fields=["subject"]),
        ]

    def __str__(self) -> str:
        return f"{self.deck.name} → {self.subject.name}"
