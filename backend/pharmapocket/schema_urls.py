"""URLConf limité à l'API v1 documentée dans le schéma OpenAPI."""

from django.urls import include, path


urlpatterns = [
    path("api/v1/", include("pharmapocket.v1_urls")),
]
