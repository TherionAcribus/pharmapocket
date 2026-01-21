from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0021_seed_pathology_thumb_overrides"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pathologythumboverride",
            name="pattern",
            field=models.CharField(
                choices=[
                    ("waves", "waves"),
                    ("chevrons", "chevrons"),
                    ("dots", "dots"),
                    ("vlines", "vlines"),
                    ("diagonals", "diagonals"),
                    ("grid", "grid"),
                    ("crosshatch", "crosshatch"),
                    ("rings", "rings"),
                    ("pluses", "pluses"),
                    ("triangles", "triangles"),
                ],
                max_length=20,
            ),
        ),
    ]
