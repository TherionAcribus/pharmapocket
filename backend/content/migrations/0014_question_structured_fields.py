from django.db import migrations, models


def _as_list(value):
    if isinstance(value, list):
        return value
    return []


def forwards(apps, schema_editor):
    Question = apps.get_model("content", "Question")

    for q in Question.objects.all():
        q_type = getattr(q, "type", None)
        choices = _as_list(getattr(q, "choices", None))
        correct = _as_list(getattr(q, "correct_answers", None))

        if q_type == "qcm":
            correct_value = None
            if correct:
                c0 = correct[0]
                if isinstance(c0, int) and 0 <= c0 < len(choices):
                    correct_value = choices[c0]
                elif isinstance(c0, str):
                    correct_value = c0

            if correct_value is None and choices:
                correct_value = choices[0]

            correct_text = str(correct_value).strip() if correct_value is not None else ""

            remaining: list[str] = []
            for c in choices:
                if c is None:
                    continue
                s = str(c).strip()
                if not s:
                    continue
                if correct_text and s == correct_text:
                    continue
                remaining.append(s)

            q.qcm_answer_1 = correct_text
            q.qcm_answer_2 = remaining[0] if len(remaining) > 0 else ""
            q.qcm_answer_3 = remaining[1] if len(remaining) > 1 else ""
            q.qcm_answer_4 = remaining[2] if len(remaining) > 2 else ""
            q.true_false_correct = ""

            q.choices = [
                q.qcm_answer_1,
                q.qcm_answer_2,
                q.qcm_answer_3,
                q.qcm_answer_4,
            ]
            q.correct_answers = [0] if q.qcm_answer_1 else None

            q.save(
                update_fields=[
                    "qcm_answer_1",
                    "qcm_answer_2",
                    "qcm_answer_3",
                    "qcm_answer_4",
                    "true_false_correct",
                    "choices",
                    "correct_answers",
                ]
            )
            continue

        if q_type == "true_false":
            correct_value = None
            if correct:
                c0 = correct[0]
                if isinstance(c0, int) and 0 <= c0 < len(choices):
                    correct_value = choices[c0]
                elif isinstance(c0, str):
                    correct_value = c0

            label = str(correct_value).strip().lower() if correct_value is not None else ""
            tf = ""
            if label in ("vrai", "true"):
                tf = "true"
            elif label in ("faux", "false"):
                tf = "false"

            q.true_false_correct = tf
            q.qcm_answer_1 = ""
            q.qcm_answer_2 = ""
            q.qcm_answer_3 = ""
            q.qcm_answer_4 = ""

            if tf == "true":
                q.choices = ["Vrai", "Faux"]
                q.correct_answers = [0]
            elif tf == "false":
                q.choices = ["Faux", "Vrai"]
                q.correct_answers = [0]
            else:
                q.choices = None
                q.correct_answers = None

            q.save(
                update_fields=[
                    "true_false_correct",
                    "qcm_answer_1",
                    "qcm_answer_2",
                    "qcm_answer_3",
                    "qcm_answer_4",
                    "choices",
                    "correct_answers",
                ]
            )
            continue


def backwards(apps, schema_editor):
    Question = apps.get_model("content", "Question")

    for q in Question.objects.all():
        q.qcm_answer_1 = ""
        q.qcm_answer_2 = ""
        q.qcm_answer_3 = ""
        q.qcm_answer_4 = ""
        q.true_false_correct = ""
        q.save(
            update_fields=[
                "qcm_answer_1",
                "qcm_answer_2",
                "qcm_answer_3",
                "qcm_answer_4",
                "true_false_correct",
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0013_alter_microarticlepage_sources"),
    ]

    operations = [
        migrations.AddField(
            model_name="question",
            name="qcm_answer_1",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="question",
            name="qcm_answer_2",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="question",
            name="qcm_answer_3",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="question",
            name="qcm_answer_4",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="question",
            name="true_false_correct",
            field=models.CharField(blank=True, choices=[("", "—"), ("true", "Vrai"), ("false", "Faux")], default="", max_length=8),
        ),
        migrations.RunPython(forwards, backwards),
    ]
