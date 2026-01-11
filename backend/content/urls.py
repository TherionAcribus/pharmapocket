from django.urls import path

from .views import (
    CardDecksView,
    DeckCardDetailView,
    DeckCardsView,
    DeckDetailView,
    DeckListCreateView,
    DeckSetDefaultView,
    MicroArticleDetailView,
    MicroArticleListView,
    MicroArticleReadStateView,
    SavedMicroArticleDetailView,
    SavedMicroArticleListView,
    SourceSearchView,
)

urlpatterns = [
    path("microarticles/", MicroArticleListView.as_view(), name="microarticle-list"),
    # use <str:slug> to allow unicode slugs (accents)
    path("microarticles/<str:slug>/", MicroArticleDetailView.as_view(), name="microarticle-detail"),
    path("decks/", DeckListCreateView.as_view(), name="deck-list"),
    path("decks/<int:deck_id>/", DeckDetailView.as_view(), name="deck-detail"),
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
