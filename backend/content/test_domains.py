"""Domaine thérapeutique porté par l'arbre « maladies ».

Ces tests verrouillent le remplacement de l'ancienne heuristique client
(`inferDomainFromPathologySlug`, qui rangeait toute pathologie non reconnue dans
« other ») par une donnée éditoriale héritée le long de l'arbre.
"""

from __future__ import annotations

from importlib import import_module

from django.test import TestCase
from wagtail.models import Page, Site

from .domains import invalidate_domain_map, resolved_domain_map
from .models import CategoryMaladies, CategoryTheme, MicroArticleIndexPage, MicroArticlePage
from .serializers import MicroArticleCardSerializer

_backfill = import_module("content.migrations.0030_backfill_categorymaladies_domain")


class ResolvedDomainMapTests(TestCase):
    def setUp(self):
        invalidate_domain_map()

    def test_child_without_domain_inherits_from_its_nearest_ancestor(self):
        root = CategoryMaladies.add_root(name="Infectiologie", domain="infectio")
        viral = root.add_child(name="Viroses")
        grippe = viral.add_child(name="Grippe saisonnière")

        mapping = resolved_domain_map()

        self.assertEqual(mapping[root.id], "infectio")
        self.assertEqual(mapping[viral.id], "infectio")
        self.assertEqual(mapping[grippe.id], "infectio")

    def test_a_node_can_override_the_inherited_domain(self):
        root = CategoryMaladies.add_root(name="Infectiologie", domain="infectio")
        endocardite = root.add_child(name="Endocardite infectieuse", domain="cardio")

        mapping = resolved_domain_map()

        self.assertEqual(mapping[root.id], "infectio")
        self.assertEqual(mapping[endocardite.id], "cardio")

    def test_a_node_without_domain_nor_ancestor_domain_resolves_to_empty(self):
        orphan = CategoryMaladies.add_root(name="Divers")

        self.assertEqual(resolved_domain_map()[orphan.id], "")

    def test_the_whole_tree_is_resolved_in_a_single_query(self):
        root = CategoryMaladies.add_root(name="Cardiologie", domain="cardio")
        for name in ("HTA", "Insuffisance cardiaque", "Angor"):
            root.add_child(name=name)
        invalidate_domain_map()

        with self.assertNumQueries(1):
            resolved_domain_map()

        # La seconde lecture est servie par le cache.
        with self.assertNumQueries(0):
            resolved_domain_map()

    def test_saving_a_category_invalidates_the_cached_map(self):
        root = CategoryMaladies.add_root(name="Cardiologie", domain="cardio")
        child = root.add_child(name="HTA")
        self.assertEqual(resolved_domain_map()[child.id], "cardio")

        root.domain = "other"
        root.save()

        self.assertEqual(resolved_domain_map()[child.id], "other")

    def test_moving_a_category_repoints_it_to_its_new_ancestor(self):
        cardio = CategoryMaladies.add_root(name="Cardiologie", domain="cardio")
        infectio = CategoryMaladies.add_root(name="Infectiologie", domain="infectio")
        node = cardio.add_child(name="Péricardite")
        self.assertEqual(resolved_domain_map()[node.id], "cardio")

        form_class = CategoryMaladies.snippet_viewset.get_form_class()
        form = form_class(
            instance=CategoryMaladies.objects.get(pk=node.pk),
            data={
                "name": node.name,
                "slug": node.slug,
                "domain": "",
                "parent": infectio.pk,
            },
        )
        self.assertTrue(form.is_valid(), form.errors)
        form.save()

        self.assertEqual(resolved_domain_map()[node.id], "infectio")


class CategoryPayloadDomainTests(TestCase):
    def setUp(self):
        invalidate_domain_map()

        root = Site.objects.get(is_default_site=True).root_page
        index = MicroArticleIndexPage(title="Micro", slug="micro-domain")
        root.add_child(instance=index)

        self.page = MicroArticlePage(
            title="Péricardite",
            slug="pericardite",
            answer_express="Inflammation du péricarde.",
            key_points=[
                {"type": "point", "value": "Douleur thoracique positionnelle"},
                {"type": "point", "value": "Frottement péricardique"},
                {"type": "point", "value": "Sus-décalage diffus concave"},
            ],
        )
        index.add_child(instance=self.page)

        cardio = CategoryMaladies.add_root(name="Cardiologie", domain="cardio")
        self.pericardite = cardio.add_child(name="Péricardite")
        self.page.categories_maladies.add(self.pericardite)

        self.theme = CategoryTheme.add_root(name="Pathologies")
        self.page.categories_theme.add(self.theme)

    def _payloads(self) -> dict:
        return MicroArticleCardSerializer(
            self.page,
            fields=("categories_maladies_payload", "categories_theme_payload"),
        ).data

    def test_maladies_payload_carries_the_resolved_domain(self):
        maladies = self._payloads()["categories_maladies_payload"]

        self.assertEqual(
            maladies,
            [
                {
                    "id": self.pericardite.id,
                    "name": "Péricardite",
                    "slug": "pericardite",
                    "domain": "cardio",
                }
            ],
        )

    def test_other_taxonomies_do_not_carry_a_domain(self):
        theme = self._payloads()["categories_theme_payload"]

        self.assertEqual(theme, [{"id": self.theme.id, "name": "Pathologies", "slug": "pathologies"}])


class BackfillHeuristicTests(TestCase):
    """L'heuristique par mots-clés ne tourne qu'une fois, dans la migration 0030."""

    def assert_guess(self, name: str, expected: str):
        self.assertEqual(_backfill._guess_domain(name, ""), expected, name)

    def test_accented_names_are_normalized_before_matching(self):
        self.assert_guess("Diabète de type 2", "endocrino")
        self.assert_guess("Hypertension artérielle", "cardio")

    def test_morphological_stems_catch_pathologies_the_old_heuristic_missed(self):
        self.assert_guess("Péricardite", "cardio")
        self.assert_guess("Psoriasis", "dermato")
        self.assert_guess("Migraine", "neuro")
        self.assert_guess("Arthrose", "rhumato")
        self.assert_guess("Cystite", "urogyneco")
        self.assert_guess("Glaucome", "ophtalmo")
        self.assert_guess("Reflux gastro-œsophagien", "gastro")

    def test_short_stems_only_match_whole_words(self):
        # « orl » en sous-chaîne accrocherait « Chlorhydrate », « borréliose »…
        self.assert_guess("Chlorhydrate de morphine", "")
        self.assert_guess("Troubles ORL", "pneumo")

    def test_ambiguous_names_are_disambiguated_by_rule_order(self):
        self.assert_guess("Angine de poitrine", "cardio")
        self.assert_guess("Angine bactérienne", "pneumo")
        self.assert_guess("Hépatite virale B", "gastro")
        self.assert_guess("Mycose vaginale", "urogyneco")
        self.assert_guess("Mycose des ongles", "dermato")

    def test_unknown_names_are_left_for_an_editor_to_fill_in(self):
        self.assert_guess("Cas particuliers", "")

    def test_backfill_only_touches_categories_without_a_domain(self):
        root = CategoryMaladies.add_root(name="Grippe")
        kept = root.add_child(name="Zona", domain="dermato")
        untouched = root.add_child(name="Cas particuliers")

        _backfill.backfill(_FakeApps(), None)

        root.refresh_from_db()
        kept.refresh_from_db()
        untouched.refresh_from_db()
        self.assertEqual(root.domain, "infectio")
        self.assertEqual(kept.domain, "dermato")
        self.assertEqual(untouched.domain, "")


class _FakeApps:
    """`apps.get_model` du registre courant, suffisant pour appeler `backfill`."""

    @staticmethod
    def get_model(app_label: str, model_name: str):
        assert (app_label, model_name) == ("content", "CategoryMaladies")
        return CategoryMaladies
