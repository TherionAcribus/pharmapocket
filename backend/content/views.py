from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response

from .models import MicroArticlePage
from .serializers import MicroArticleDetailSerializer, MicroArticleListSerializer


def _cover_url(page: MicroArticlePage) -> str | None:
    if not page.cover_image_id:
        return None
    try:
        return page.cover_image.file.url
    except Exception:
        return None


def _key_points(page: MicroArticlePage) -> list[str]:
    return [block.value for block in page.key_points]


class MicroArticleListView(ListAPIView):
    serializer_class = MicroArticleListSerializer

    def get_queryset(self):
        qs = MicroArticlePage.objects.live().public().specific().order_by("-first_published_at")

        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__name__iexact=tag)

        return qs.distinct()

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        data = [
            {
                "id": p.id,
                "slug": p.slug,
                "title_question": p.title_question,
                "answer_express": p.answer_express,
                "takeaway": p.takeaway,
                "key_points": _key_points(p),
                "cover_image_url": _cover_url(p),
                "tags": list(p.tags.values_list("name", flat=True)),
            }
            for p in qs
        ]
        serializer = self.get_serializer(data, many=True)
        return Response(serializer.data)


class MicroArticleDetailView(RetrieveAPIView):
    serializer_class = MicroArticleDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return MicroArticlePage.objects.live().public().specific()

    def retrieve(self, request, *args, **kwargs):
        page: MicroArticlePage = self.get_object()
        data = {
            "id": page.id,
            "slug": page.slug,
            "title_question": page.title_question,
            "answer_express": page.answer_express,
            "takeaway": page.takeaway,
            "key_points": _key_points(page),
            "cover_image_url": _cover_url(page),
            "links": [b.value for b in page.links] if page.links else [],
            "see_more": [{"type": b.block_type, "value": b.value} for b in page.see_more] if page.see_more else [],
            "tags": list(page.tags.values_list("name", flat=True)),
            "categories_pharmacologie": list(page.categories_pharmacologie.values_list("name", flat=True)),
            "categories_maladies": list(page.categories_maladies.values_list("name", flat=True)),
            "categories_classes": list(page.categories_classes.values_list("name", flat=True)),
        }
        serializer = self.get_serializer(data)
        return Response(serializer.data)
