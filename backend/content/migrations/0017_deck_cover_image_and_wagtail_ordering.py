from django.db import migrations, models
from django.db.models import Case, IntegerField, Value, When
import django.db.models.deletion
import modelcluster.fields


def forwards_fill_sort_order(apps, schema_editor):
    DeckCard = apps.get_model("content", "DeckCard")

    qs = (
        DeckCard.objects.all()
        .annotate(
            _pos_is_null=Case(
                When(position__isnull=True, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        .order_by("deck_id", "_pos_is_null", "position", "id")
    )

    current_deck_id = None
    sort_idx = 0
    buffer = []

    def flush():
        nonlocal buffer
        if buffer:
            DeckCard.objects.bulk_update(buffer, ["sort_order"])
            buffer = []

    for row in qs.iterator():
        if current_deck_id != row.deck_id:
            flush()
            current_deck_id = row.deck_id
            sort_idx = 0

        row.sort_order = sort_idx
        sort_idx += 1
        buffer.append(row)

        if len(buffer) >= 500:
            flush()

    flush()


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0016_official_decks_and_progress"),
    ]

    operations = [
        migrations.AddField(
            model_name="deck",
            name="cover_image",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="deck_covers",
                to="content.customimage",
                verbose_name="Illustration",
            ),
        ),
        migrations.AddField(
            model_name="deckcard",
            name="sort_order",
            field=models.IntegerField(blank=True, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name="deckcard",
            name="deck",
            field=modelcluster.fields.ParentalKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="deck_cards",
                to="content.deck",
            ),
        ),
        migrations.RunPython(forwards_fill_sort_order, reverse_code=migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name="deckcard",
            name="content_dec_deck_id_pos_idx",
        ),
        migrations.RemoveField(
            model_name="deckcard",
            name="position",
        ),
        migrations.AddIndex(
            model_name="deckcard",
            index=models.Index(fields=["deck", "sort_order"], name="content_dec_deck_id_sort_idx"),
        ),
    ]
