from wagtail.api.v2.router import WagtailAPIRouter

# Wagtail 6.x sépare les viewsets images/documents dans leurs modules dédiés
try:
    from wagtail.api.v2.views import PagesAPIViewSet
    from wagtail.images.api.v2.views import ImagesAPIViewSet
    from wagtail.documents.api.v2.views import DocumentsAPIViewSet
except ImportError:  # fallback compat
    from wagtail.api.v2.views import PagesAPIViewSet
    ImagesAPIViewSet = None
    DocumentsAPIViewSet = None

api_router = WagtailAPIRouter("wagtailapi")
api_router.register_endpoint("pages", PagesAPIViewSet)
if ImagesAPIViewSet:
    api_router.register_endpoint("images", ImagesAPIViewSet)
if DocumentsAPIViewSet:
    api_router.register_endpoint("documents", DocumentsAPIViewSet)

try:
    from wagtail.api.v2.views import SnippetsAPIViewSet

    api_router.register_endpoint("snippets", SnippetsAPIViewSet)
except Exception:
    pass
