from __future__ import annotations

from django import forms
from django.db import transaction
from django.utils.text import slugify
from wagtail.admin.forms.models import WagtailAdminModelForm


class CategoryParentChoiceField(forms.ModelChoiceField):
    """Display the category depth in the otherwise flat parent selector."""

    def label_from_instance(self, obj) -> str:
        indentation = "\N{NO-BREAK SPACE}\N{NO-BREAK SPACE}" * max(obj.depth - 1, 0)
        marker = "> " if obj.depth > 1 else ""
        return f"{indentation}{marker}{obj}"


class CategoryNodeForm(WagtailAdminModelForm):
    """Create and move category nodes through treebeard's public API."""

    parent = CategoryParentChoiceField(
        queryset=None,
        required=False,
        label="Parent",
        help_text="Laisser vide pour créer une catégorie racine.",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        model = self._meta.model
        parent_queryset = model.objects.all()
        if self.instance.pk:
            # A node cannot become its own parent, nor a child of one of its
            # descendants. Filtering here also rejects forged POST values.
            parent_queryset = parent_queryset.exclude(path__startswith=self.instance.path)
            self.initial.setdefault("parent", self.instance.get_parent())

        self.fields["parent"].queryset = parent_queryset

    def clean_slug(self) -> str:
        return self.cleaned_data.get("slug") or slugify(self.cleaned_data.get("name", ""))

    def save(self, commit=True):
        if not commit:
            raise ValueError("CategoryNodeForm requires commit=True to allocate a tree path")

        instance = super().save(commit=False)
        parent = self.cleaned_data["parent"]

        with transaction.atomic():
            if instance._state.adding:
                if parent is None:
                    instance = self._meta.model.add_root(instance=instance)
                else:
                    instance = parent.add_child(instance=instance)
            else:
                current_parent = instance.get_parent()
                current_parent_id = current_parent.pk if current_parent else None
                parent_id = parent.pk if parent else None

                instance.save()
                if parent_id != current_parent_id or "name" in self.changed_data:
                    if parent is None:
                        other_root = (
                            self._meta.model.get_root_nodes()
                            .exclude(pk=instance.pk)
                            .first()
                        )
                        if other_root is not None:
                            instance.move(other_root, pos="sorted-sibling")
                    else:
                        instance.move(
                            parent,
                            pos="sorted-child",
                        )
                    instance.refresh_from_db()

            self.instance = instance
            self._save_m2m()

        return instance
