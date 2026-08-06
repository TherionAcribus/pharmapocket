"""Import JSON de fiches : résolution des références et garde-fous éditoriaux."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from taggit.models import Tag
from wagtail.images import get_image_model
from wagtail.models import Page, Site

from .importers import import_cards
from .models import (
    CardType,
    CategoryMaladies,
    CategoryTheme,
    MicroArticleIndexPage,
    MicroArticlePage,
    Question,
    Source,
    Subject,
)

IMPORT_URL = "/api/v1/content/admin/microarticles/import/"


def _card(**overrides) -> dict:
    card = {
        "title": "Quand contrôler la kaliémie sous IEC ?",
        "answer_express": "<p>Dans les <b>7 à 14 jours</b> après l'instauration.</p>",
        "categories_theme": ["cardiologie"],
        "sources": [
            {
                "source": {
                    "name": "Bon usage des IEC",
                    "kind": "institutional",
                    "url": "https://ansm.example/iec",
                    "publisher": "ANSM",
                    "publication_date": "2024-03-01",
                }
            }
        ],
    }
    card.update(overrides)
    return card


class CardImportTests(APITestCase):
    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro import", slug="micro-import")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()

        self.theme = CategoryTheme.add_root(name="Cardiologie")

    # -- Import nominal ----------------------------------------------------

    def test_import_creates_draft_card_with_resolved_relations(self):
        report = import_cards([
            _card(
                key_points=["Risque d'hyperkaliémie", "Contrôle créatinine associé"],
                takeaway="<p>Contrôle biologique systématique.</p>",
                tags=["iec", "biologie"],
                categories_maladies=[],
                see_more=[
                    {"type": "detail", "value": "<p>Le contrôle porte aussi sur la créatinine.</p>"},
                    {"type": "monitoring", "value": {"what": "Kaliémie", "why": "Risque d'hyperkaliémie"}},
                ],
                questions=[
                    {
                        "type": "qcm",
                        "prompt": "Sous quel délai contrôler la kaliémie ?",
                        "answers": ["7 à 14 jours", "24 heures", "3 mois", "1 an"],
                        "explanation": "Le contrôle précoce dépiste l'hyperkaliémie.",
                        "difficulty": 2,
                    }
                ],
            )
        ])

        self.assertTrue(report["ok"], report)
        page = MicroArticlePage.objects.get(slug="quand-controler-la-kaliemie-sous-iec")
        self.assertFalse(page.live)
        self.assertEqual(page.card_type, CardType.STANDARD)
        self.assertEqual([b.value for b in page.key_points], ["Risque d'hyperkaliémie", "Contrôle créatinine associé"])
        self.assertEqual(list(page.categories_theme.values_list("slug", flat=True)), ["cardiologie"])
        self.assertEqual(sorted(t.name for t in page.tags.all()), ["biologie", "iec"])
        self.assertEqual(len(page.see_more), 2)
        self.assertEqual(page.microarticle_questions.count(), 1)

        source = Source.objects.get(name="Bon usage des IEC")
        self.assertEqual(page.sources[0].value["source"], source)
        self.assertEqual(report["results"][0]["created_sources"], ["Bon usage des IEC"])

    def test_answer_detail_is_stored_and_served_in_see_more(self):
        report = import_cards([
            _card(
                answer_detail="<p>Le contrôle porte sur la kaliémie <b>et</b> la créatinine.</p>",
                see_more=[{"type": "final_summary", "value": "Contrôle à J7-J14."}],
            )
        ], publish=True)

        self.assertTrue(report["ok"], report)
        page = MicroArticlePage.objects.get(id=report["results"][0]["id"])
        self.assertIn("créatinine", page.answer_detail)

        # L'API sert `answer_detail` en tête de `see_more` : c'est ce que lit
        # l'utilisateur qui déplie la fiche.
        resp = self.client.get(f"/api/v1/content/microarticles/{page.slug}/", secure=True)
        self.assertEqual(resp.status_code, 200)
        blocks = resp.data["see_more"]
        self.assertEqual(blocks[0]["type"], "detail")
        self.assertIn("créatinine", blocks[0]["value"])
        self.assertEqual(blocks[1]["type"], "final_summary")

    def test_publish_makes_the_card_live(self):
        report = import_cards([_card()], publish=True)

        self.assertTrue(report["ok"], report)
        self.assertTrue(MicroArticlePage.objects.get(slug="quand-controler-la-kaliemie-sous-iec").live)

    def test_existing_source_is_reused_not_duplicated(self):
        Source.objects.create(name="Bon usage des IEC", url="https://ansm.example/iec", publisher="ANSM")

        report = import_cards([_card()])

        self.assertTrue(report["ok"], report)
        self.assertEqual(Source.objects.filter(url="https://ansm.example/iec").count(), 1)
        self.assertEqual(report["results"][0]["created_sources"], [])

    def test_new_tags_are_reported(self):
        report = import_cards([_card(tags=["iec", "biologie"])])

        self.assertTrue(report["ok"], report)
        self.assertEqual(sorted(report["results"][0]["created_tags"]), ["biologie", "iec"])

    def test_tag_differing_only_by_case_or_accent_is_attached_to_the_existing_one(self):
        import_cards([_card(tags=["iec", "insuffisance-renale"])])

        report = import_cards(
            [_card(title="Deuxième fiche", tags=["IEC", "Insuffisance-Rénale"])]
        )

        self.assertTrue(report["ok"], report)
        result = report["results"][0]
        self.assertEqual(result["tags"], ["iec", "insuffisance-renale"])
        self.assertEqual(result["created_tags"], [])
        self.assertEqual(Tag.objects.filter(name__in=["IEC", "iec"]).count(), 1)

        page = MicroArticlePage.objects.get(id=result["id"])
        self.assertEqual(sorted(t.name for t in page.tags.all()), ["iec", "insuffisance-renale"])
        self.assertIn("rattaché au tag existant", " ".join(result["warnings"]))

    def test_existing_question_is_reused(self):
        question = Question.objects.create(
            type=Question.QuestionType.TRUE_FALSE,
            prompt="Les IEC exposent à l'hyperkaliémie ?",
            true_false_correct=Question.TrueFalseCorrect.TRUE,
        )

        report = import_cards([
            _card(questions=[{"type": "true_false", "prompt": question.prompt, "correct": "true"}])
        ])

        self.assertTrue(report["ok"], report)
        self.assertEqual(Question.objects.count(), 1)
        self.assertEqual(report["results"][0]["reused_questions"], 1)

    def test_recap_card_links_detail_created_earlier_in_the_batch(self):
        report = import_cards([
            _card(title="Test de grossesse avant isotrétinoïne", card_type="detail"),
            _card(
                title="Délivrance isotrétinoïne : l'essentiel",
                card_type="recap",
                recap_points=[
                    {"text": "Test de grossesse", "detail_card_slug": "test-de-grossesse-avant-isotretinoine"},
                    {"text": "Carnet de suivi"},
                ],
            ),
        ])

        self.assertTrue(report["ok"], report)
        recap = MicroArticlePage.objects.get(slug="delivrance-isotretinoine-lessentiel")
        points = list(recap.recap_points.order_by("sort_order"))
        self.assertEqual([p.text for p in points], ["Test de grossesse", "Carnet de suivi"])
        self.assertEqual(points[0].detail_card.slug, "test-de-grossesse-avant-isotretinoine")
        self.assertIsNone(points[1].detail_card)

    def test_subject_is_created_and_linked(self):
        report = import_cards([
            _card(subject={"name": "Délivrance isotrétinoïne", "label": "Kaliémie"})
        ])

        self.assertTrue(report["ok"], report)
        subject = Subject.objects.get(slug="delivrance-isotretinoine")
        self.assertEqual(subject.subject_cards.count(), 1)
        self.assertEqual(subject.subject_cards.first().label, "Kaliémie")

    # -- Refus -------------------------------------------------------------

    def test_batch_is_all_or_nothing(self):
        report = import_cards([
            _card(),
            _card(title="Fiche sans thème", categories_theme=[]),
        ])

        self.assertFalse(report["ok"])
        self.assertTrue(report["results"][0]["ok"])
        self.assertFalse(report["results"][1]["ok"])
        self.assertEqual(MicroArticlePage.objects.count(), 0)
        self.assertEqual(Source.objects.count(), 0)

    def test_unknown_category_is_reported_without_creating_it(self):
        report = import_cards([_card(categories_maladies=["Insuffisance rénale chronique"])])

        self.assertFalse(report["ok"])
        self.assertIn("categories_maladies", report["results"][0]["errors"][0])
        self.assertEqual(CategoryMaladies.objects.count(), 0)

        # Le rapport doit permettre de créer la catégorie sans la ressaisir.
        self.assertEqual(
            report["unknown_categories"],
            [
                {
                    "field": "categories_maladies",
                    "taxonomy": "maladies",
                    "value": "Insuffisance rénale chronique",
                    "suggested_name": "Insuffisance rénale chronique",
                    "suggested_slug": "insuffisance-renale-chronique",
                }
            ],
        )

    def test_unknown_categories_are_deduplicated_across_the_batch(self):
        report = import_cards([
            _card(categories_maladies=["Insuffisance rénale chronique"]),
            _card(title="Deuxième fiche", categories_maladies=["insuffisance-renale-chronique"]),
        ])

        self.assertFalse(report["ok"])
        self.assertEqual(len(report["unknown_categories"]), 1)

    def test_missing_source_is_rejected(self):
        report = import_cards([_card(sources=[])])

        self.assertFalse(report["ok"])
        self.assertIn("sources", report["results"][0]["errors"][0])

    def test_duplicate_slug_is_rejected(self):
        import_cards([_card()])

        report = import_cards([_card()])

        self.assertFalse(report["ok"])
        self.assertIn("slug", report["results"][0]["errors"][0])
        self.assertEqual(MicroArticlePage.objects.count(), 1)

    # -- Mise à jour --------------------------------------------------------

    def test_update_rewrites_the_card_in_place(self):
        import_cards([_card(key_points=["Ancien point"], tags=["iec"])])
        page_id = MicroArticlePage.objects.get(slug="quand-controler-la-kaliemie-sous-iec").id

        report = import_cards(
            [
                _card(
                    answer_express="<p>Contrôle à <b>J7</b>.</p>",
                    key_points=["Nouveau point"],
                    tags=["biologie"],
                )
            ],
            on_existing="update",
        )

        self.assertTrue(report["ok"], report)
        self.assertEqual(report["results"][0]["action"], "updated")
        self.assertEqual(report["updated"], 1)
        self.assertEqual(MicroArticlePage.objects.count(), 1)

        page = MicroArticlePage.objects.get(id=page_id)
        self.assertIn("J7", page.answer_express)
        self.assertEqual([b.value for b in page.key_points], ["Nouveau point"])
        self.assertEqual([t.name for t in page.tags.all()], ["biologie"])

    def test_update_of_a_published_card_stays_in_a_draft_revision(self):
        import_cards([_card()], publish=True)
        page = MicroArticlePage.objects.get(slug="quand-controler-la-kaliemie-sous-iec")

        report = import_cards(
            [_card(answer_express="<p>Texte corrigé.</p>")],
            on_existing="update",
        )

        self.assertTrue(report["ok"], report)
        page.refresh_from_db()
        # Le contenu en ligne ne doit pas bouger tant qu'on n'a pas publié.
        self.assertNotIn("corrigé", page.answer_express)
        self.assertTrue(page.has_unpublished_changes)
        self.assertIn("corrigé", page.get_latest_revision_as_object().answer_express)

    def test_update_with_publish_replaces_the_live_content(self):
        import_cards([_card()], publish=True)

        report = import_cards(
            [_card(answer_express="<p>Texte corrigé.</p>")],
            publish=True,
            on_existing="update",
        )

        self.assertTrue(report["ok"], report)
        page = MicroArticlePage.objects.get(slug="quand-controler-la-kaliemie-sous-iec")
        self.assertIn("corrigé", page.answer_express)
        self.assertTrue(page.live)

    def test_update_keeps_the_cover_image_the_json_never_mentions(self):
        import_cards([_card()])
        page = MicroArticlePage.objects.get(slug="quand-controler-la-kaliemie-sous-iec")
        # `width`/`height` fournis : Django n'ouvre alors pas le fichier, inutile
        # d'écrire un vrai PNG pour ce test.
        image = get_image_model().objects.create(
            title="Schéma", file="original_images/schema.png", width=1, height=1
        )
        page.cover_image = image
        page.save()

        report = import_cards([_card()], on_existing="update")

        self.assertTrue(report["ok"], report)
        page.refresh_from_db()
        self.assertEqual(page.cover_image_id, image.id)

    def test_update_does_not_duplicate_the_subject_link(self):
        card = _card(subject={"name": "Rein et IEC", "label": "Kaliémie"})
        import_cards([card])

        report = import_cards(
            [_card(subject={"name": "Rein et IEC", "label": "Contrôle biologique"})],
            on_existing="update",
        )

        self.assertTrue(report["ok"], report)
        subject = Subject.objects.get(slug="rein-et-iec")
        self.assertEqual(subject.subject_cards.count(), 1)
        self.assertEqual(subject.subject_cards.first().label, "Contrôle biologique")

    def test_editorial_limits_are_enforced(self):
        report = import_cards([
            _card(
                key_points=["x" * 91],
                see_more=[
                    {"type": "detail", "value": "<p>a</p>"},
                    {"type": "final_summary", "value": "b"},
                    {"type": "monitoring", "value": {"what": "c", "why": "d"}},
                    {"type": "final_summary", "value": "e"},
                ],
            )
        ])

        self.assertFalse(report["ok"])
        errors = " ".join(report["results"][0]["errors"])
        self.assertIn("key_points", errors)
        self.assertIn("see_more", errors)

    def test_unknown_see_more_block_is_rejected(self):
        report = import_cards([_card(see_more=[{"type": "posology", "value": "1 cp/j"}])])

        self.assertFalse(report["ok"])
        self.assertIn("bloc inconnu", " ".join(report["results"][0]["errors"]))

    def test_qcm_requires_four_answers(self):
        report = import_cards([
            _card(questions=[{"type": "qcm", "prompt": "Combien ?", "answers": ["a", "b"]}])
        ])

        self.assertFalse(report["ok"])
        self.assertIn("4 propositions", " ".join(report["results"][0]["errors"]))
        self.assertEqual(Question.objects.count(), 0)

    def test_empty_answer_express_is_rejected(self):
        report = import_cards([_card(answer_express="   ")])

        self.assertFalse(report["ok"])
        self.assertIn("answer_express", report["results"][0]["errors"][0])

    def test_rich_text_is_sanitized(self):
        report = import_cards([
            _card(answer_express='<p onclick="x()">Contrôle <script>alert(1)</script>précoce.</p>')
        ])

        self.assertTrue(report["ok"], report)
        stored = MicroArticlePage.objects.get(id=report["results"][0]["id"]).answer_express
        self.assertNotIn("<script", stored)
        self.assertNotIn("onclick", stored)
        self.assertIn("Contrôle", stored)

    def test_unknown_field_is_reported_as_warning(self):
        report = import_cards([_card(niveau="expert")])

        self.assertTrue(report["ok"], report)
        self.assertIn("niveau", report["results"][0]["warnings"][0])

    # -- Dry-run -----------------------------------------------------------

    def test_dry_run_validates_without_writing(self):
        report = import_cards([_card()], dry_run=True)

        self.assertTrue(report["ok"], report)
        self.assertTrue(report["dry_run"])
        self.assertEqual(MicroArticlePage.objects.count(), 0)
        self.assertEqual(Source.objects.count(), 0)


class CardImportEndpointTests(APITestCase):
    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        if not Site.objects.exists():
            Site.objects.create(hostname="localhost", root_page=root, is_default_site=True)

        self.index = MicroArticleIndexPage(title="Micro import api", slug="micro-import-api")
        root.add_child(instance=self.index)
        self.index.save_revision().publish()
        CategoryTheme.add_root(name="Cardiologie")

        self.staff = get_user_model().objects.create_user(
            username="import-staff",
            email="import-staff@example.com",
            password="pharmapocket-test-pwd",
            is_staff=True,
        )

    def test_staff_can_import_a_single_card_object(self):
        self.client.force_authenticate(user=self.staff)

        resp = self.client.post(IMPORT_URL, {"cards": _card(), "publish": True}, format="json", secure=True)

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["ok"])
        page = MicroArticlePage.objects.get(id=resp.data["results"][0]["id"])
        self.assertTrue(page.live)
        self.assertEqual(page.owner, self.staff)

    def test_invalid_card_returns_400_with_per_card_errors(self):
        self.client.force_authenticate(user=self.staff)

        resp = self.client.post(
            IMPORT_URL,
            {"cards": [_card(categories_theme=[])]},
            format="json",
            secure=True,
        )

        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.data["ok"])
        self.assertTrue(resp.data["results"][0]["errors"])
        self.assertEqual(MicroArticlePage.objects.count(), 0)

    def test_staff_creates_the_category_proposed_by_the_report_then_imports(self):
        self.client.force_authenticate(user=self.staff)
        card = _card(categories_maladies=["Insuffisance rénale chronique"])

        refused = self.client.post(IMPORT_URL, {"cards": [card]}, format="json", secure=True)
        self.assertEqual(refused.status_code, 400)
        proposed = refused.data["unknown_categories"][0]

        created = self.client.post(
            f"/api/v1/content/admin/taxonomies/{proposed['taxonomy']}/nodes/",
            {"name": proposed["suggested_name"], "slug": proposed["suggested_slug"]},
            format="json",
            secure=True,
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["slug"], "insuffisance-renale-chronique")
        self.assertIsNone(created.data["parent_id"])

        retried = self.client.post(IMPORT_URL, {"cards": [card]}, format="json", secure=True)
        self.assertEqual(retried.status_code, 200, retried.data)
        page = MicroArticlePage.objects.get(id=retried.data["results"][0]["id"])
        self.assertEqual(
            list(page.categories_maladies.values_list("slug", flat=True)),
            ["insuffisance-renale-chronique"],
        )

    def test_import_requires_staff(self):
        member = get_user_model().objects.create_user(
            username="import-member",
            email="import-member@example.com",
            password="pharmapocket-test-pwd",
        )
        self.client.force_authenticate(user=member)

        resp = self.client.post(IMPORT_URL, {"cards": [_card()]}, format="json", secure=True)

        self.assertEqual(resp.status_code, 403)
        self.assertEqual(MicroArticlePage.objects.count(), 0)
