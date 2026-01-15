from django.urls import path

from .views import (
    AdminMicroArticleSearchView,
    AdminPackBulkAddView,
    AdminPackDetailView,
    AdminPackListCreateView,
    AdminPackRemoveCardView,
    AdminPackReorderCardsView,
    CardDecksView,
    DeckCardDetailView,
    DeckCardsView,
    DeckDetailView,
    DeckListCreateView,
    DeckSetDefaultView,
    LandingView,
    MicroArticleDetailView,
    MicroArticleListView,
    MicroArticleReadStateView,
    OfficialDeckProgressView,
    OfficialDeckStartView,
    SavedMicroArticleDetailView,
    SavedMicroArticleListView,
    SourceSearchView,
)

urlpatterns = [
    path("landing/", LandingView.as_view(), name="landing"),
    path("microarticles/", MicroArticleListView.as_view(), name="microarticle-list"),
    # use <str:slug> to allow unicode slugs (accents)
    path("microarticles/<str:slug>/", MicroArticleDetailView.as_view(), name="microarticle-detail"),

    # Admin pack builder (staff only)
    path("admin/packs/", AdminPackListCreateView.as_view(), name="admin-pack-list"),
    path("admin/packs/<int:pack_id>/", AdminPackDetailView.as_view(), name="admin-pack-detail"),
    path(
        "admin/packs/<int:pack_id>/bulk-add/",
        AdminPackBulkAddView.as_view(),
        name="admin-pack-bulk-add",
    ),
    path(
        "admin/packs/<int:pack_id>/cards/reorder/",
        AdminPackReorderCardsView.as_view(),
        name="admin-pack-reorder",
    ),
    path(
        "admin/packs/<int:pack_id>/cards/<int:card_id>/remove/",
        AdminPackRemoveCardView.as_view(),
        name="admin-pack-remove-card",
    ),
    path(
        "admin/microarticles/search/",
        AdminMicroArticleSearchView.as_view(),
        name="admin-microarticle-search",
    ),

    path("decks/", DeckListCreateView.as_view(), name="deck-list"),
    path("decks/<int:deck_id>/", DeckDetailView.as_view(), name="deck-detail"),
    path(
        "decks/<int:deck_id>/start/",
        OfficialDeckStartView.as_view(),
        name="official-deck-start",
    ),
    path(
        "decks/<int:deck_id>/progress/",
        OfficialDeckProgressView.as_view(),
        name="official-deck-progress",
    ),
    path(
        "decks/<int:deck_id>/set-default/",
        DeckSetDefaultView.as_view(),
        name="deck-set-default",
    ),
    path("decks/<int:deck_id>/cards/", DeckCardsView.as_view(), name="deck-cards"),
    path(
        "decks/<int:deck_id>/cards/<int:card_id>/",
        DeckCardDetailView.as_view(),
        name="deck-card-detail",
    ),
    path("cards/<int:card_id>/decks/", CardDecksView.as_view(), name="card-decks"),
    path("saved/", SavedMicroArticleListView.as_view(), name="saved-microarticle-list"),
    path(
        "saved/<str:slug>/",
        SavedMicroArticleDetailView.as_view(),
        name="saved-microarticle-detail",
    ),
    path("read-state/", MicroArticleReadStateView.as_view(), name="microarticle-read-state"),
    path("sources/search/", SourceSearchView.as_view(), name="source-search"),
]
