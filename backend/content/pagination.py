from rest_framework.pagination import CursorPagination


class MicroArticleCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-first_published_at", "-id")
    cursor_query_param = "cursor"
