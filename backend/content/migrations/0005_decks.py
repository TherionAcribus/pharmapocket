from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


def forwards(apps, schema_editor):
    Deck = apps.get_model("content", "Deck")
    DeckCard = apps.get_model("content", "DeckCard")
    SavedMicroArticle = apps.get_model("content", "SavedMicroArticle")
    UserModel = apps.get_model(*settings.AUTH_USER_MODEL.split("."))

    for user in UserModel.objects.all().iterator():
        default_deck = Deck.objects.filter(user_id=user.id, is_default=True).first()
        if default_deck is None:
            Deck.objects.filter(user_id=user.id, is_default=True).update(is_default=False)
            existing = Deck.objects.filter(user_id=user.id, name="Mes cartes").first()
            if existing is not None:
                existing.is_default = True
                existing.sort_order = 0
                existing.save(update_fields=["is_default", "sort_order", "updated_at"])
                default_deck = existing
            else:
                default_deck = Deck.objects.create(
                    user_id=user.id,
                    name="Mes cartes",
                    is_default=True,
                    sort_order=0,
                )

        saved_rows = SavedMicroArticle.objects.filter(user_id=user.id).values_list(
            "microarticle_id", flat=True
        )
        for microarticle_id in saved_rows.iterator():
            DeckCard.objects.get_or_create(
                deck_id=default_deck.id,
                microarticle_id=microarticle_id,
            )


def backwards(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0004_rename_content_mic_user_id_a5fce3_idx_content_mic_user_id_2a3eff_idx"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Deck",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=60)),
                ("is_default", models.BooleanField(default=False)),
                ("sort_order", models.IntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="decks",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [models.Index(fields=["user", "sort_order"], name="content_dec_user_id_4e5dbe_idx")],
            },
        ),
        migrations.CreateModel(
            name="DeckCard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("added_at", models.DateTimeField(auto_now_add=True)),
                (
                    "deck",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deck_cards",
                        to="content.deck",
                    ),
                ),
                (
                    "microarticle",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deck_links",
                        to="content.microarticlepage",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["deck", "added_at"], name="content_dec_deck_id_65c2d8_idx"),
                    models.Index(fields=["microarticle"], name="content_dec_microarticle_72ce4e_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="deck",
            constraint=models.UniqueConstraint(fields=("user", "name"), name="uniq_deck_user_name"),
        ),
        migrations.AddConstraint(
            model_name="deck",
            constraint=models.UniqueConstraint(
                fields=("user",),
                condition=Q(is_default=True),
                name="uniq_deck_default_per_user",
            ),
        ),
        migrations.AddConstraint(
            model_name="deckcard",
            constraint=models.UniqueConstraint(fields=("deck", "microarticle"), name="uniq_deck_card"),
        ),
        migrations.RunPython(forwards, backwards),
    ]
