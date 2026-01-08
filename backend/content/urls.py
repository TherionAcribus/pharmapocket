from django.urls import path

from .views import MicroArticleDetailView, MicroArticleListView, SourceSearchView

urlpatterns = [
    path("microarticles/", MicroArticleListView.as_view(), name="microarticle-list"),
    # use <str:slug> to allow unicode slugs (accents)
    path("microarticles/<str:slug>/", MicroArticleDetailView.as_view(), name="microarticle-detail"),
    path("sources/search/", SourceSearchView.as_view(), name="source-search"),
]
