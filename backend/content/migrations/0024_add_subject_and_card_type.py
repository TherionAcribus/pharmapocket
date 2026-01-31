from django.db import migrations, models
import django.db.models.deletion
import modelcluster.fields


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0023_pack_alter_deckcard_options_alter_question_options_and_more"),
    ]

    operations = [
        # Add card_type field to MicroArticlePage
        migrations.AddField(
            model_name="microarticlepage",
            name="card_type",
            field=models.CharField(
                choices=[
                    ("standard", "Standard"),
                    ("recap", "Récap"),
                    ("detail", "Détail"),
                ],
                default="standard",
                help_text="Type de carte : standard, récap (vue d'ensemble), ou détail (atomique).",
                max_length=16,
            ),
        ),
        # Create Subject model
        migrations.CreateModel(
            name="Subject",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(blank=True, max_length=140, unique=True)),
                ("description", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Sujet",
                "verbose_name_plural": "Sujets",
                "ordering": ["name"],
            },
        ),
        # Create SubjectCard model
        migrations.CreateModel(
            name="SubjectCard",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("sort_order", models.IntegerField(blank=True, editable=False, null=True)),
                (
                    "label",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Nom court du point (affiché dans la liste récap).",
                        max_length=120,
                    ),
                ),
                (
                    "microarticle",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="subject_links",
                        to="content.microarticlepage",
                    ),
                ),
                (
                    "subject",
                    modelcluster.fields.ParentalKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="subject_cards",
                        to="content.subject",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        # Create DeckSubject model
        migrations.CreateModel(
            name="DeckSubject",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("sort_order", models.IntegerField(blank=True, editable=False, null=True)),
                (
                    "deck",
                    modelcluster.fields.ParentalKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deck_subjects",
                        to="content.deck",
                    ),
                ),
                (
                    "subject",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deck_links",
                        to="content.subject",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        # Add constraints and indexes for SubjectCard
        migrations.AddConstraint(
            model_name="subjectcard",
            constraint=models.UniqueConstraint(
                fields=("subject", "microarticle"), name="uniq_subject_card"
            ),
        ),
        migrations.AddIndex(
            model_name="subjectcard",
            index=models.Index(
                fields=["subject", "sort_order"], name="content_sub_subject_8e5a4e_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="subjectcard",
            index=models.Index(
                fields=["microarticle"], name="content_sub_microar_4f7c2a_idx"
            ),
        ),
        # Add constraints and indexes for DeckSubject
        migrations.AddConstraint(
            model_name="decksubject",
            constraint=models.UniqueConstraint(
                fields=("deck", "subject"), name="uniq_deck_subject"
            ),
        ),
        migrations.AddIndex(
            model_name="decksubject",
            index=models.Index(
                fields=["deck", "sort_order"], name="content_dec_deck_id_subj_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="decksubject",
            index=models.Index(
                fields=["subject"], name="content_dec_subject_d2b1c3_idx"
            ),
        ),
    ]
