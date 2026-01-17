from django.db import migrations, models
import modelcluster.fields


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0017_deck_cover_image_and_wagtail_ordering"),
    ]

    operations = [
        migrations.CreateModel(
            name="CategoryPharmacologie",
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
                ("path", models.CharField(max_length=255, unique=True)),
                ("depth", models.PositiveIntegerField()),
                ("numchild", models.PositiveIntegerField(default=0)),
                ("name", models.CharField(max_length=120, unique=True)),
                ("slug", models.SlugField(blank=True, max_length=140, unique=True)),
            ],
            options={
                "verbose_name": "Catégorie pharmacologie",
                "verbose_name_plural": "Catégories pharmacologie",
            },
        ),
        migrations.AddField(
            model_name="microarticlepage",
            name="categories_pharmacologie",
            field=modelcluster.fields.ParentalManyToManyField(
                blank=True,
                related_name="microarticles",
                to="content.categorypharmacologie",
            ),
        ),
    ]
