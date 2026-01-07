from django.urls import path

from .views import CategoryResolveView, FeedView, MicroByIdView, MicroBySlugView

urlpatterns = [
    path("feed/", FeedView.as_view(), name="feed"),
    # use <str:slug> to allow unicode slugs (accents)
    path("micro/<str:slug>/", MicroBySlugView.as_view(), name="micro-by-slug"),
    path("micro/id/<int:id>/", MicroByIdView.as_view(), name="micro-by-id"),
    path("categories/resolve/", CategoryResolveView.as_view(), name="category-resolve"),
]
