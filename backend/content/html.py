from __future__ import annotations

import bleach


# This is intentionally narrower than Wagtail's editor configuration. It is
# the final boundary before editorial HTML is returned to a browser client.
_ALLOWED_TAGS = {
    "a",
    "b",
    "blockquote",
    "br",
    "em",
    "i",
    "li",
    "ol",
    "p",
    "strong",
    "ul",
}
_ALLOWED_ATTRIBUTES = {"a": ["href", "title"]}
_ALLOWED_PROTOCOLS = {"http", "https", "mailto"}


def sanitize_rich_text(value: object | None) -> str:
    """Return editorial rich text safe to insert into an HTML context."""
    return bleach.clean(
        str(value or ""),
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        protocols=_ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )
