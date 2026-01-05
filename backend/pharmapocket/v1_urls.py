from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token

from content.public_views import TagListView, TaxonomyResolveView, TaxonomyTreeView

urlpatterns = [
    path("auth/token/", obtain_auth_token),
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
