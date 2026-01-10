from django.urls import include, path

from content.public_views import TagListView, TaxonomyResolveView, TaxonomyTreeView
from pharmapocket.auth_views import CsrfView, MeView

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("taxonomies/<str:taxonomy>/tree/", TaxonomyTreeView.as_view(), name="taxonomy-tree"),
    path(
        "taxonomies/<str:taxonomy>/resolve/",
        TaxonomyResolveView.as_view(),
        name="taxonomy-resolve",
    ),
    path("tags/", TagListView.as_view(), name="tag-list"),
    path("content/", include("content.urls")),
    path("learning/", include("learning.urls")),
    path("", include("product.urls")),
]
