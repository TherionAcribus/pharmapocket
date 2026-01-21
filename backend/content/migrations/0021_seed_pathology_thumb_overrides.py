from django.db import migrations


def seed_overrides(apps, schema_editor):
    PathologyThumbOverride = apps.get_model("content", "PathologyThumbOverride")

    seeds = [
        ("grippe", "#6D5BD0", "#D7D2FF", "waves"),
        ("zona", "#7A3E9D", "#E6C8F7", "chevrons"),
        ("diabete", "#2D74DA", "#CFE3FF", "dots"),
        ("hta", "#D64545", "#FFD0D0", "vlines"),
    ]

    for pathology_slug, bg, accent, pattern in seeds:
        obj, created = PathologyThumbOverride.objects.get_or_create(
            pathology_slug=pathology_slug,
            defaults={
                "bg": bg,
                "accent": accent,
                "pattern": pattern,
            },
        )
        if created:
            continue

        # Don't overwrite if user already customized it.
        if obj.bg != bg or obj.accent != accent or obj.pattern != pattern:
            continue

        # Touch row to ensure consistent save behavior (optional but harmless)
        obj.save(update_fields=["updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0020_pathology_thumb_override"),
    ]

    operations = [
        migrations.RunPython(seed_overrides, migrations.RunPython.noop),
    ]
