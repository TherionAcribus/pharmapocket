from django.templatetags.static import static
from django.utils.html import format_html

from wagtail import hooks


@hooks.register("insert_editor_js")
def editor_js():
    return format_html(
        '<script src="{}"></script><script src="{}"></script>',
        static("content/answer_express_counter.js"),
        static("content/question_admin.js"),
    )
