from django.templatetags.static import static
from django.utils.html import format_html
from django.urls import path

from wagtail import hooks

from .wagtail_pack_admin import pack_bulk_add


@hooks.register("insert_editor_js")
def editor_js():
    return format_html(
        '<script src="{}"></script><script src="{}"></script><script src="{}"></script>',
        static("content/answer_express_counter.js"),
        static("content/question_admin.js"),
        static("content/category_select_filter.js"),
    )


@hooks.register("insert_global_admin_js")
def pack_admin_js():
    return format_html('<script src="{}"></script>', static("content/pack_admin.js"))


@hooks.register("insert_global_admin_css")
def pack_admin_css():
    return format_html('<link rel="stylesheet" href="{}">', static("content/pack_admin.css"))


@hooks.register("register_admin_urls")
def register_pack_admin_urls():
    return [
        path("packs/<int:pack_id>/bulk-add/", pack_bulk_add, name="pack_bulk_add"),
    ]
