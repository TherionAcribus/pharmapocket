from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="landing_redirect_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="landing_redirect_target",
            field=models.CharField(
                choices=[
                    ("start", "Commencer"),
                    ("discover", "Dose du jour"),
                    ("cards", "Mes cartes"),
                    ("review", "Révision"),
                    ("quiz", "Quiz"),
                ],
                default="start",
                max_length=32,
            ),
        ),
    ]
