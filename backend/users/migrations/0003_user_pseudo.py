from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_landing_redirect"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="pseudo",
            field=models.CharField(blank=True, default="", max_length=60),
        ),
    ]
