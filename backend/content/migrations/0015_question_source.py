from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0014_question_structured_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="question",
            name="source",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="questions",
                to="content.source",
            ),
        ),
        migrations.AlterField(
            model_name="question",
            name="references",
            field=models.JSONField(blank=True, null=True, editable=False),
        ),
        migrations.AlterField(
            model_name="question",
            name="choices",
            field=models.JSONField(blank=True, null=True, editable=False),
        ),
        migrations.AlterField(
            model_name="question",
            name="correct_answers",
            field=models.JSONField(blank=True, null=True, editable=False),
        ),
    ]
