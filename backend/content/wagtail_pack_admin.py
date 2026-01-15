import re
from urllib.parse import urlparse

from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.decorators import permission_required
from django.db import transaction
from django.db.models import Max
from django.http import HttpRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from .models import DeckCard, MicroArticlePage, Pack


def _extract_page_id(token: str) -> int | None:
    if token.isdigit():
        return int(token)

    m = re.search(r"/([0-9]+)/?", token)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None

    return None


def _extract_slug(token: str) -> str | None:
    token = token.strip()
    if not token:
        return None

    try:
        parsed = urlparse(token)
        if parsed.scheme and parsed.netloc:
            parts = [p for p in parsed.path.split("/") if p]
            if parts:
                return parts[-1]
    except Exception:
        pass

    if "/" in token:
        parts = [p for p in token.split("/") if p]
        if parts:
            token = parts[-1]

    return token or None


@staff_member_required
@permission_required("content.change_pack", raise_exception=True)
def pack_bulk_add(request: HttpRequest, pack_id: int):
    pack = get_object_or_404(Pack, id=pack_id)

    if request.method == "POST":
        raw = request.POST.get("items", "")
        tokens = [t.strip() for t in re.split(r"[\s,;]+", raw) if t and t.strip()]

        added: list[dict] = []
        already_present: list[dict] = []
        not_found: list[str] = []

        max_sort = (
            DeckCard.objects.filter(deck_id=pack.id)
            .aggregate(Max("sort_order"))
            .get("sort_order__max")
        )
        next_sort = int(max_sort) + 1 if max_sort is not None else 0

        with transaction.atomic():
            for token in tokens:
                page_id = _extract_page_id(token)
                page = None
                if page_id is not None:
                    page = MicroArticlePage.objects.filter(id=page_id).first()
                if page is None:
                    slug = _extract_slug(token)
                    if slug:
                        page = MicroArticlePage.objects.filter(slug=slug).order_by("id").first()

                if page is None:
                    not_found.append(token)
                    continue

                exists = DeckCard.objects.filter(deck_id=pack.id, microarticle_id=page.id).exists()
                if exists:
                    already_present.append({"id": page.id, "title": page.title, "slug": page.slug})
                    continue

                obj = DeckCard(deck=pack, microarticle=page)
                obj.sort_order = next_sort
                next_sort += 1
                obj.save()
                added.append({"id": page.id, "title": page.title, "slug": page.slug})

        messages.success(
            request,
            f"Ajout terminé : {len(added)} ajoutée(s), {len(already_present)} déjà présente(s), {len(not_found)} introuvable(s).",
        )

        return redirect(reverse("pack_bulk_add", kwargs={"pack_id": pack.id}))

    count = DeckCard.objects.filter(deck_id=pack.id).count()
    return render(
        request,
        "wagtailadmin/packs/bulk_add.html",
        {
            "pack": pack,
            "cards_count": count,
        },
    )
