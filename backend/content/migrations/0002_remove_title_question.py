from django.db import migrations


def copy_title_question_to_title(apps, schema_editor):
    MicroArticlePage = apps.get_model("content", "MicroArticlePage")
    for page in MicroArticlePage.objects.all():
        if not page.title and getattr(page, "title_question", None):
            page.title = page.title_question
            page.save(update_fields=["title"])


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(copy_title_question_to_title, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="microarticlepage",
            name="title_question",
        ),
    ]
