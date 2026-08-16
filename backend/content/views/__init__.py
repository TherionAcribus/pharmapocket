"""Vues de l'app `content`, éclatées par domaine.

Ce module réexporte tout ce que l'ancien `content/views.py` exposait, pour que
`from .views import X` (notamment dans `content/urls.py`) continue de fonctionner.
"""

from .cards_admin import AdminCardImportView
from .decks import (
    CardDecksView,
    DeckCardDetailView,
    DeckCardsBulkAddView,
    DeckCardsView,
    DeckDetailView,
    DeckListCreateView,
    DeckListSerializer,
    DeckSetDefaultView,
    OfficialDeckCopyToUserView,
    OfficialDeckProgressView,
    OfficialDeckStartView,
    build_progress_payload,
)
from .feed import (
    LandingView,
    MicroArticleDetailView,
    MicroArticleListView,
    MicroArticleReadStateView,
    SavedMicroArticleDetailView,
    SavedMicroArticleListView,
    SourceSearchSerializer,
    SourceSearchView,
)
# Helpers internes : réexportés pour compatibilité avec l'ancien module plat,
# volontairement absents de `__all__` (importer depuis `.helpers` désormais).
from .helpers import (  # noqa: F401
    _apply_tree_filter,
    _get_default_deck,
    _get_or_create_default_deck,
    _get_subject_for_card,
    _is_card_in_default_deck,
    _parse_int,
    _reference_payload,
    _sanitize_stream_value,
    _stream_items,
    _subject_card_summary,
    _subject_detail_cards,
    _subject_payload,
    _subject_recap_card,
    _taxonomy_model,
)
from .packs_admin import (
    AdminImageUploadView,
    AdminMicroArticleSearchView,
    AdminPackBulkAddView,
    AdminPackDetailView,
    AdminPackListCreateView,
    AdminPackRemoveCardView,
    AdminPackReorderCardsView,
)
from .subjects import (
    SubjectCardDetailView,
    SubjectCardsReorderView,
    SubjectCardsView,
    SubjectDetailView,
    SubjectListCreateView,
)
from .taxonomies_admin import AdminTaxonomyNodeCreateView
from .thumbs import (
    AdminThumbOverrideDetailView,
    AdminThumbOverrideListCreateView,
    ThumbOverridesPublicView,
)

__all__ = [
    # feed
    "LandingView",
    "MicroArticleDetailView",
    "MicroArticleListView",
    "MicroArticleReadStateView",
    "SavedMicroArticleDetailView",
    "SavedMicroArticleListView",
    "SourceSearchSerializer",
    "SourceSearchView",
    # decks
    "CardDecksView",
    "DeckCardDetailView",
    "DeckCardsBulkAddView",
    "DeckCardsView",
    "DeckDetailView",
    "DeckListCreateView",
    "DeckListSerializer",
    "DeckSetDefaultView",
    "OfficialDeckCopyToUserView",
    "OfficialDeckProgressView",
    "OfficialDeckStartView",
    "build_progress_payload",
    # fiches admin
    "AdminCardImportView",
    # taxonomies admin
    "AdminTaxonomyNodeCreateView",
    # packs admin
    "AdminImageUploadView",
    "AdminMicroArticleSearchView",
    "AdminPackBulkAddView",
    "AdminPackDetailView",
    "AdminPackListCreateView",
    "AdminPackRemoveCardView",
    "AdminPackReorderCardsView",
    # subjects
    "SubjectCardDetailView",
    "SubjectCardsReorderView",
    "SubjectCardsView",
    "SubjectDetailView",
    "SubjectListCreateView",
    # thumb overrides
    "AdminThumbOverrideDetailView",
    "AdminThumbOverrideListCreateView",
    "ThumbOverridesPublicView",
]
