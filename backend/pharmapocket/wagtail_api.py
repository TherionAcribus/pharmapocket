from wagtail.api.v2.router import WagtailAPIRouter
from rest_framework.permissions import AllowAny

# Wagtail 6.x sépare les viewsets images/documents dans leurs modules dédiés
try:
    from wagtail.api.v2.views import PagesAPIViewSet
    from wagtail.images.api.v2.views import ImagesAPIViewSet
    from wagtail.documents.api.v2.views import DocumentsAPIViewSet
except ImportError:  # fallback compat
    from wagtail.api.v2.views import PagesAPIViewSet
    ImagesAPIViewSet = None
    DocumentsAPIViewSet = None


class PublicPagesAPIViewSet(PagesAPIViewSet):
    permission_classes = [AllowAny]


api_router = WagtailAPIRouter("wagtailapi")
api_router.register_endpoint("pages", PublicPagesAPIViewSet)
if ImagesAPIViewSet:
    class PublicImagesAPIViewSet(ImagesAPIViewSet):
        permission_classes = [AllowAny]

    api_router.register_endpoint("images", PublicImagesAPIViewSet)
if DocumentsAPIViewSet:
    class PublicDocumentsAPIViewSet(DocumentsAPIViewSet):
        permission_classes = [AllowAny]

    api_router.register_endpoint("documents", PublicDocumentsAPIViewSet)

try:
    from wagtail.api.v2.views import SnippetsAPIViewSet

    class PublicSnippetsAPIViewSet(SnippetsAPIViewSet):
        permission_classes = [AllowAny]

    api_router.register_endpoint("snippets", PublicSnippetsAPIViewSet)
except Exception:
    pass
