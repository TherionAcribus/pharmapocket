"""Recherche plein-texte des micro-articles.

Les vues passent par le backend de recherche Wagtail (Postgres full-text, table
``wagtailsearch_indexentry``) plutôt que par des ``icontains`` : ceux-ci scannent
la table entière, ignorent le contenu des StreamField et ne trouvent que des
sous-chaînes exactes (« insuline » ne remonte pas « insulines »).

Les accents sont gérés côté application : ``MicroArticlePage`` indexe une copie
translittérée en ASCII de ses champs textuels, et on interroge l'index avec la
requête translittérée de la même façon. Aucune extension Postgres requise.

Le backend renvoie un ``SearchResults``, pas un queryset : on en extrait les ids
puis on filtre le queryset d'origine. Les vues gardent ainsi leur tri, leurs
``select_related``/``prefetch_related`` et leur pagination curseur.
"""

from __future__ import annotations

import logging

from anyascii import anyascii
from django.db.models import Q, QuerySet

from .models import MicroArticlePage

logger = logging.getLogger(__name__)

# Nombre maximal de fiches remontées par le backend de recherche. Les ids sont
# ensuite réinjectés dans un `pk__in`, donc c'est aussi la taille maximale de
# cette clause : au-delà, la requête coûte plus cher que le gain de pertinence.
MAX_SEARCH_MATCHES = 500


def search_microarticle_ids(
    query: str,
    *,
    autocomplete: bool = False,
    limit: int = MAX_SEARCH_MATCHES,
) -> list[int] | None:
    """Ids des fiches publiées correspondant à ``query``, par pertinence décroissante.

    ``autocomplete=True`` traite le dernier terme comme un préfixe (frappe en
    cours) et n'interroge que les ``AutocompleteField`` du modèle.

    Renvoie ``None`` — et non une liste vide — si le backend de recherche est
    indisponible, pour que l'appelant puisse se rabattre sur un filtre SQL.
    """
    q = anyascii((query or "").strip())
    if not q:
        return []

    base = MicroArticlePage.objects.live().public()
    try:
        results = base.autocomplete(q) if autocomplete else base.search(q)
        return [page.pk for page in results[:limit]]
    except Exception:
        logger.exception("[search] backend indisponible, repli sur icontains (q=%r)", query)
        return None


def filter_microarticles(
    queryset: QuerySet,
    query: str,
    *,
    autocomplete: bool = False,
    fallback_fields: tuple[str, ...] = ("title", "answer_express"),
) -> QuerySet:
    """Restreint ``queryset`` aux fiches correspondant à ``query``.

    Le repli ``icontains`` sur ``fallback_fields`` ne sert que si le backend de
    recherche est en panne : sans lui, la recherche renverrait silencieusement
    zéro résultat le temps de l'incident.
    """
    q = (query or "").strip()
    if not q:
        return queryset

    ids = search_microarticle_ids(q, autocomplete=autocomplete)
    if ids == [] and not autocomplete:
        # Aucun mot entier ne correspond : l'utilisateur a peut-être tapé un début de
        # mot (« amoxi »), ce que les `icontains` remontaient. On retente en préfixe
        # plutôt que de renvoyer une page vide.
        ids = search_microarticle_ids(q, autocomplete=True) or ids
    if ids is not None:
        return queryset.filter(pk__in=ids)

    conditions = Q()
    for field in fallback_fields:
        conditions |= Q(**{f"{field}__icontains": q})
    return queryset.filter(conditions)
