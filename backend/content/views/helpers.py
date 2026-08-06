"""Helpers partagés par les vues de `content`.

Sérialisation des fiches (payloads image, tags, catégories, sujets), garde-fous
d'accès et filtres taxonomiques réutilisés par plusieurs modules du package.
"""

from datetime import date, datetime

from wagtail.documents.models import Document
from wagtail.images import get_image_model

from ..html import sanitize_rich_text
from ..models import (
    CardType,
    CategoryMedicament,
    CategoryMaladies,
    CategoryPharmacologie,
    CategoryTheme,
    Deck,
    MicroArticlePage,
    Source,
    Subject,
    SubjectCard,
)
from ..serializers import image_payload


def _stream_items(field) -> list:
    if not field:
        return []
    try:
        return list(field)  # StreamValue iterable (StreamField)
    except Exception:
        try:
            return list(field.stream_data)
        except Exception:
            return []


def _get_or_create_default_deck(user) -> Deck:
    deck = Deck.objects.filter(user=user, type=Deck.DeckType.USER, is_default=True).first()
    if deck is not None:
        return deck

    Deck.objects.filter(user=user, type=Deck.DeckType.USER, is_default=True).update(is_default=False)
    existing = Deck.objects.filter(user=user, type=Deck.DeckType.USER, name="Mes cartes").first()
    if existing is not None:
        existing.is_default = True
        existing.sort_order = 0
        existing.save(update_fields=["is_default", "sort_order", "updated_at"])
        return existing

    return Deck.objects.create(
        user=user,
        type=Deck.DeckType.USER,
        name="Mes cartes",
        is_default=True,
        sort_order=0,
    )


def _subject_payload(subject: Subject | None) -> dict | None:
    """Retourne les données d'un sujet."""
    if subject is None:
        return None
    return {
        "id": subject.id,
        "name": subject.name,
        "slug": subject.slug,
        "description": subject.description,
    }


def _get_subject_for_card(page: MicroArticlePage) -> Subject | None:
    """Retourne le sujet auquel la carte appartient (si existant)."""
    link = SubjectCard.objects.filter(microarticle=page).select_related("subject").first()
    return link.subject if link else None


def _subject_card_summary(page: MicroArticlePage) -> dict:
    """Retourne un résumé minimal de la carte pour les listes récap."""
    return {
        "id": page.id,
        "slug": page.slug,
        "title": page.title,
        "card_type": page.card_type,
    }


def _subject_detail_cards(subject: Subject) -> list[dict]:
    """Retourne les cartes détails d'un sujet avec leur label."""
    links = (
        subject.subject_cards.filter(microarticle__card_type=CardType.DETAIL)
        .select_related("microarticle")
        .order_by("sort_order")
    )
    return [
        {
            "id": link.microarticle.id,
            "slug": link.microarticle.slug,
            "title": link.microarticle.title,
            "label": link.label or link.microarticle.title,
            "sort_order": link.sort_order,
        }
        for link in links
    ]


def _subject_recap_card(subject: Subject) -> dict | None:
    """Retourne la carte récap d'un sujet (si existante)."""
    link = (
        subject.subject_cards.filter(microarticle__card_type=CardType.RECAP)
        .select_related("microarticle")
        .first()
    )
    if link is None:
        return None
    return {
        "id": link.microarticle.id,
        "slug": link.microarticle.slug,
        "title": link.microarticle.title,
    }


def _taxonomy_model(taxonomy: str):
    if taxonomy == "theme":
        return CategoryTheme, "categories_theme"
    if taxonomy == "maladies":
        return CategoryMaladies, "categories_maladies"
    if taxonomy == "medicament":
        return CategoryMedicament, "categories_medicament"
    if taxonomy == "pharmacologie":
        return CategoryPharmacologie, "categories_pharmacologie"
    return None, None


def _apply_tree_filter(qs, *, taxonomy: str, node_id: int, scope: str):
    model, rel = _taxonomy_model(taxonomy)
    if model is None:
        return qs, False

    node = model.objects.filter(id=node_id).first()
    if node is None:
        return qs, False

    if scope == "exact":
        return qs.filter(**{rel: node}), True

    if scope == "subtree":
        return qs.filter(**{f"{rel}__path__startswith": node.path}), True

    return qs, False


def _parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _sanitize_stream_value(value):
    if value is None:
        return None

    ImageModel = get_image_model()
    if isinstance(value, ImageModel):
        return image_payload(value)

    if isinstance(value, Source):
        return {
            "id": value.id,
            "name": value.name,
            "kind": value.kind,
            "url": value.url,
            "publisher": value.publisher,
            "author": value.author,
            "publication_date": value.publication_date.isoformat() if value.publication_date else None,
            "accessed_date": value.accessed_date.isoformat() if value.accessed_date else None,
            "notes": value.notes,
        }

    if isinstance(value, Document):
        try:
            url = value.file.url
        except Exception:
            url = None
        return {"id": value.id, "title": value.title, "url": url}

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if isinstance(value, str):
        return value

    if isinstance(value, dict):
        return {k: _sanitize_stream_value(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [_sanitize_stream_value(v) for v in value]

    if hasattr(value, "source") and isinstance(getattr(value, "source", None), str):
        # Wagtail RichText
        return sanitize_rich_text(value)

    if hasattr(value, "__iter__") and hasattr(value, "items"):
        try:
            return {k: _sanitize_stream_value(v) for k, v in dict(value).items()}
        except Exception:
            pass

    return str(value)


def _reference_payload(value: dict) -> dict:
    # value schema from ReferenceBlock: {"source": Source, "note": str, "page": str, "document": Document}
    source = value.get("source")
    document = value.get("document")

    source_payload = _sanitize_stream_value(source)

    document_payload = _sanitize_stream_value(document)

    return {
        "source": source_payload,
        "note": value.get("note") or "",
        "page": value.get("page") or "",
        "document": document_payload,
    }
