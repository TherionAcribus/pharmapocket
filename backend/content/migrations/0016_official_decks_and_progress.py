from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0015_question_source"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="deck",
            name="type",
            field=models.CharField(
                choices=[("user", "User"), ("official", "Official")],
                default="user",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="deck",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="deck",
            name="difficulty",
            field=models.CharField(
                blank=True,
                choices=[
                    ("beginner", "Beginner"),
                    ("intermediate", "Intermediate"),
                    ("advanced", "Advanced"),
                ],
                default="",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="deck",
            name="estimated_minutes",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="deck",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("published", "Published"),
                    ("archived", "Archived"),
                ],
                default="published",
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name="deck",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="decks",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RemoveConstraint(
            model_name="deck",
            name="uniq_deck_default_per_user",
        ),
        migrations.AddConstraint(
            model_name="deck",
            constraint=models.UniqueConstraint(
                condition=Q(is_default=True, type="user"),
                fields=("user",),
                name="uniq_deck_default_per_user",
            ),
        ),
        migrations.AddField(
            model_name="deckcard",
            name="position",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="deckcard",
            name="is_optional",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="deckcard",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddIndex(
            model_name="deckcard",
            index=models.Index(fields=["deck", "position"], name="content_dec_deck_id_pos_idx"),
        ),
        migrations.CreateModel(
            name="UserDeckProgress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("cards_seen_count", models.PositiveIntegerField(default=0)),
                ("cards_done_count", models.PositiveIntegerField(default=0)),
                (
                    "mode_last",
                    models.CharField(
                        choices=[
                            ("ordered", "Ordered"),
                            ("shuffle", "Shuffle"),
                            ("due_only", "Due only"),
                        ],
                        default="ordered",
                        max_length=16,
                    ),
                ),
                (
                    "deck",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_progress",
                        to="content.deck",
                    ),
                ),
                (
                    "last_card",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="last_seen_in_deck_progress",
                        to="content.microarticlepage",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deck_progress",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={},
        ),
        migrations.AddConstraint(
            model_name="userdeckprogress",
            constraint=models.UniqueConstraint(
                fields=("user", "deck"),
                name="uniq_user_deck_progress",
            ),
        ),
        migrations.AddIndex(
            model_name="userdeckprogress",
            index=models.Index(fields=["user", "deck"], name="content_udp_user_deck_idx"),
        ),
        migrations.AddIndex(
            model_name="userdeckprogress",
            index=models.Index(fields=["user", "last_seen_at"], name="content_udp_user_last_seen_idx"),
        ),
    ]
