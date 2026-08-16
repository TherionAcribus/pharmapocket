"""Fusionne `content.MicroArticleReadState` dans `LessonProgress.completed`.

L'état « lu » était stocké dans deux modèles écrits par deux chemins distincts
(mutation directe côté lecteur et sync de progression). `LessonProgress` devient
la source unique ; cette migration récupère les lignes de l'ancien modèle avant
sa suppression (`content.0027_delete_microarticlereadstate`).
"""

from django.db import migrations


def backfill_read_states(apps, schema_editor):
    MicroArticleReadState = apps.get_model("content", "MicroArticleReadState")
    LessonProgress = apps.get_model("learning", "LessonProgress")

    read_states = MicroArticleReadState.objects.all().order_by("pk").iterator()
    for state in read_states:
        percent = 100 if state.is_read else 0
        progress = LessonProgress.objects.filter(
            user_id=state.user_id,
            lesson_id=state.microarticle_id,
        ).first()

        if progress is None:
            LessonProgress.objects.create(
                user_id=state.user_id,
                lesson_id=state.microarticle_id,
                seen=True,
                completed=state.is_read,
                percent=percent,
                time_ms=0,
                updated_at=state.updated_at,
                last_seen_at=state.updated_at,
            )
            continue

        # Même règle de merge que le sync : le `updated_at` le plus récent gagne.
        if state.updated_at <= progress.updated_at:
            continue

        progress.seen = True
        progress.completed = state.is_read
        progress.percent = percent
        progress.updated_at = state.updated_at
        progress.save(update_fields=["seen", "completed", "percent", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0003_rename_learn_srs_user_due_learning_ca_user_id_7d3825_idx_and_more"),
        ("content", "0026_rename_content_dec_deck_id_subj_idx_content_dec_deck_id_2810a9_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_read_states, migrations.RunPython.noop),
    ]
