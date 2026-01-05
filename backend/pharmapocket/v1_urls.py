from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token

urlpatterns = [
    path("auth/token/", obtain_auth_token),
    path("content/", include("content.urls")),
    path("learning/", include("learning.urls")),
    path("", include("product.urls")),
]
