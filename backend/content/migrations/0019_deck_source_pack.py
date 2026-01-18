from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0018_category_pharmacologie"),
    ]

    operations = [
        migrations.AddField(
            model_name="deck",
            name="source_pack",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="copied_user_decks",
                to="content.deck",
            ),
        ),
    ]
