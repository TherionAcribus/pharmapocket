"""Invalidations de cache déclenchées par les écritures sur le contenu."""

from __future__ import annotations

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .domains import invalidate_domain_map
from .models import CategoryMaladies


@receiver(post_save, sender=CategoryMaladies)
@receiver(post_delete, sender=CategoryMaladies)
def _invalidate_maladies_domain_map(sender, **kwargs) -> None:
    # `CategoryNodeForm` enregistre le nœud avant de le déplacer dans l'arbre :
    # le `save()` invalide, et la carte est reconstruite après coup, donc sur les
    # chemins déjà à jour.
    invalidate_domain_map()
