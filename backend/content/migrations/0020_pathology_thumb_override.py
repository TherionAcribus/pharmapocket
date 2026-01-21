from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0019_deck_source_pack"),
    ]

    operations = [
        migrations.CreateModel(
            name="PathologyThumbOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pathology_slug", models.SlugField(max_length=140, unique=True)),
                ("bg", models.CharField(max_length=20)),
                ("accent", models.CharField(max_length=20)),
                (
                    "pattern",
                    models.CharField(
                        choices=[
                            ("waves", "waves"),
                            ("chevrons", "chevrons"),
                            ("dots", "dots"),
                            ("vlines", "vlines"),
                            ("diagonals", "diagonals"),
                        ],
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Override vignette pathologie",
                "verbose_name_plural": "Overrides vignettes pathologies",
            },
        ),
    ]
