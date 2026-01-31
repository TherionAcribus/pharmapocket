from django.db import migrations, models
import django.db.models.deletion
import modelcluster.fields


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0024_add_subject_and_card_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecapPoint",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sort_order",
                    models.IntegerField(blank=True, editable=False, null=True),
                ),
                (
                    "text",
                    models.CharField(
                        help_text="Texte du point (ex: 'utilisation d'une contraception').",
                        max_length=200,
                    ),
                ),
                (
                    "detail_card",
                    models.ForeignKey(
                        blank=True,
                        help_text="Fiche détail associée (optionnel).",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="recap_point_links",
                        to="content.microarticlepage",
                    ),
                ),
                (
                    "recap_card",
                    modelcluster.fields.ParentalKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="recap_points",
                        to="content.microarticlepage",
                    ),
                ),
            ],
            options={
                "verbose_name": "Point récap",
                "verbose_name_plural": "Points récap",
                "ordering": ["sort_order"],
                "abstract": False,
            },
        ),
    ]
