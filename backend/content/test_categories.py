from django.test import TestCase

from .models import CategoryMedicament, CategoryTheme


class CategoryTreeCreationTests(TestCase):
    def _snippet_form_class(self, model):
        return model.snippet_viewset.get_form_class()

    def test_direct_save_of_new_node_is_rejected(self):
        category = CategoryMedicament(name="Antibiotiques")

        with self.assertRaisesMessage(ValueError, "add_root() or parent.add_child()"):
            category.save()

        self.assertFalse(CategoryMedicament.objects.exists())

    def test_treebeard_api_creates_root_and_child_with_generated_slugs(self):
        root = CategoryMedicament.add_root(name="Anti-infectieux")
        child = root.add_child(name="Antibiotiques")

        self.assertEqual(root.slug, "anti-infectieux")
        self.assertEqual(child.slug, "antibiotiques")
        self.assertTrue(root.is_root())
        self.assertEqual(child.get_parent(), root)

    def test_wagtail_snippet_form_creates_root_or_child_from_parent(self):
        form_class = self._snippet_form_class(CategoryMedicament)

        root_form = form_class(data={"name": "Cardiologie", "slug": "", "parent": ""})
        self.assertTrue(root_form.is_valid(), root_form.errors)
        root = root_form.save()

        child_form = form_class(
            data={"name": "Bêtabloquants", "slug": "", "parent": root.pk}
        )
        self.assertTrue(child_form.is_valid(), child_form.errors)
        child = child_form.save()

        self.assertTrue(root.is_root())
        self.assertEqual(child.get_parent(), root)
        self.assertEqual(child.depth, 2)
        self.assertEqual(child.slug, "betabloquants")

    def test_wagtail_snippet_form_can_change_parent(self):
        first_root = CategoryTheme.add_root(name="Premier")
        second_root = CategoryTheme.add_root(name="Second")
        form_class = self._snippet_form_class(CategoryTheme)

        form = form_class(
            instance=second_root,
            data={"name": second_root.name, "slug": second_root.slug, "parent": first_root.pk},
        )
        self.assertTrue(form.is_valid(), form.errors)
        moved = form.save()

        self.assertEqual(moved.get_parent(), first_root)
        self.assertEqual(moved.depth, 2)

        promote_form = form_class(
            instance=moved,
            data={"name": moved.name, "slug": moved.slug, "parent": ""},
        )
        self.assertTrue(promote_form.is_valid(), promote_form.errors)
        promoted = promote_form.save()

        self.assertTrue(promoted.is_root())
        self.assertEqual(promoted.depth, 1)

    def test_wagtail_snippet_form_rejects_descendant_as_parent(self):
        root = CategoryTheme.add_root(name="Racine")
        child = root.add_child(name="Enfant")
        form_class = self._snippet_form_class(CategoryTheme)

        form = form_class(
            instance=root,
            data={"name": root.name, "slug": root.slug, "parent": child.pk},
        )

        self.assertFalse(form.is_valid())
        self.assertIn("parent", form.errors)
