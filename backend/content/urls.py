from django.urls import path
 
from .views import MicroArticleDetailView, MicroArticleListView
 
urlpatterns = [
    path("microarticles/", MicroArticleListView.as_view(), name="microarticle-list"),
    # use <str:slug> to allow unicode slugs (accents)
    path("microarticles/<str:slug>/", MicroArticleDetailView.as_view(), name="microarticle-detail"),
]
