"""Résolution du domaine thérapeutique porté par l'arbre des maladies.

Le domaine est saisi dans Wagtail sur les nœuds `CategoryMaladies`. Un nœud sans
domaine hérite de son ancêtre le plus proche qui en porte un, ce qui permet de ne
renseigner que les racines de l'arbre ("Infectiologie", "Cardiologie"…) et de
laisser les pathologies filles suivre.

L'héritage est résolu à la lecture, sur l'arbre complet : c'est une table de
quelques dizaines de lignes, et le résultat est mémorisé en cache jusqu'à la
prochaine écriture (voir `content.signals`). On évite ainsi un `get_ancestors()`
par catégorie sérialisée, qui ferait un N+1 sur le feed.
"""

from __future__ import annotations

from django.core.cache import cache

CACHE_KEY = "content:maladies-domain-map:v1"
CACHE_TTL = 24 * 3600


def _build_domain_map() -> dict[int, str]:
    from .models import CategoryMaladies

    steplen = CategoryMaladies.steplen
    rows = CategoryMaladies.objects.order_by("path").only("id", "path", "depth", "domain")

    # `order_by("path")` garantit qu'un parent est vu avant ses enfants, donc son
    # domaine résolu est déjà connu quand on traite l'enfant.
    by_path: dict[str, str] = {}
    resolved: dict[int, str] = {}
    for node in rows:
        inherited = by_path.get(node.path[:-steplen], "") if node.depth > 1 else ""
        domain = node.domain or inherited
        by_path[node.path] = domain
        resolved[node.id] = domain
    return resolved


def resolved_domain_map() -> dict[int, str]:
    """`{category_id: domain}`, domaines hérités inclus. Chaîne vide si aucun."""
    cached = cache.get(CACHE_KEY)
    if cached is not None:
        return cached

    mapping = _build_domain_map()
    cache.set(CACHE_KEY, mapping, CACHE_TTL)
    return mapping


def invalidate_domain_map() -> None:
    cache.delete(CACHE_KEY)
