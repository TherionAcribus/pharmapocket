from django.urls import path

from .views import MicroArticleDetailView, MicroArticleListView

urlpatterns = [
    path("microarticles/", MicroArticleListView.as_view(), name="microarticle-list"),
    path("microarticles/<slug:slug>/", MicroArticleDetailView.as_view(), name="microarticle-detail"),
]
