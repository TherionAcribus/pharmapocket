from django.urls import include, path

from content.public_views import TagListView, TaxonomyResolveView, TaxonomyTreeView
from pharmapocket.auth_views import AccountView, CsrfView, DeleteAccountView, MeView, PreferencesView

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/preferences/", PreferencesView.as_view(), name="auth-preferences"),
    path("auth/account/", AccountView.as_view(), name="auth-account"),
    path("auth/account/delete/", DeleteAccountView.as_view(), name="auth-account-delete"),
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
