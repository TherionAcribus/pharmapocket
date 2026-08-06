"""Import de fiches (`MicroArticlePage`) depuis un JSON éditorial.

Ce format est le contrat entre le prompt de génération
(`docs/prompt_generation_cartes.md`) et la base. Il ne contient **aucun
identifiant de base** : les sources, catégories, tags et fiches liées sont
désignés par leur nom, leur slug ou leur URL, et résolus (ou créés pour les
sources et les tags) au moment de l'import.

Les garde-fous éditoriaux (longueurs, cardinalités) sont revalidés ici : les
`max_length` des blocs StreamField ne sont appliqués que par les formulaires
Wagtail, pas à l'enregistrement.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from html import unescape
from typing import Any

import bleach
from anyascii import anyascii
from django.db import transaction
from django.utils.text import slugify

from .html import sanitize_rich_text
from .models import (
    CardType,
    CategoryMaladies,
    CategoryMedicament,
    CategoryPharmacologie,
    CategoryTheme,
    MicroArticleIndexPage,
    MicroArticlePage,
    MicroArticleQuestion,
    Question,
    RecapPoint,
    Source,
    Subject,
    SubjectCard,
)

# Clés acceptées à la racine d'une carte. Toute autre clé est ignorée avec un
# avertissement : c'est le signal le plus utile quand le LLM invente un champ.
CARD_KEYS = {
    "title",
    "slug",
    "card_type",
    "answer_express",
    "key_points",
    "takeaway",
    "see_more",
    "sources",
    "links",
    "tags",
    "categories_theme",
    "categories_maladies",
    "categories_medicament",
    "categories_pharmacologie",
    "questions",
    "recap_points",
    "related_articles",
    "subject",
    "cover_image_id",
}

TAXONOMIES = {
    "categories_theme": CategoryTheme,
    "categories_maladies": CategoryMaladies,
    "categories_medicament": CategoryMedicament,
    "categories_pharmacologie": CategoryPharmacologie,
}

# `see_more` : blocs de type ListBlock(CharBlock) et longueur max par item.
SEE_MORE_LIST_BLOCKS = {
    "indications": 120,
    "adverse_effects": 120,
    "warnings": 140,
    "interactions": 140,
}

MAX_KEY_POINTS = 5
MAX_KEY_POINT_LEN = 90
MAX_SEE_MORE_BLOCKS = 3
MAX_SOURCES = 5
MAX_LINKS = 5
ANSWER_EXPRESS_SOFT_LIMIT = 350
TAKEAWAY_SOFT_LIMIT = 200


class CardImportError(Exception):
    """Interrompt l'import d'une carte ; les détails sont dans le contexte."""


@dataclass
class _Ctx:
    """Collecte erreurs et avertissements d'une carte pour un rapport unique.

    On accumule au lieu de lever à la première erreur : l'auteur du prompt doit
    pouvoir corriger tout le JSON en une passe.
    """

    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    created_sources: list[str] = field(default_factory=list)
    created_questions: int = 0
    reused_questions: int = 0

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def _plain_len(value: str) -> int:
    """Longueur du texte visible, balises retirées."""
    return len(unescape(bleach.clean(value or "", tags=set(), strip=True)).strip())


def _clean_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _normalize(value: str) -> str:
    """Clé de comparaison insensible à la casse et aux accents."""
    return anyascii(value or "").strip().lower()


def _parse_date(value: Any, label: str, ctx: _Ctx) -> date | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        ctx.error(f"{label} : date attendue au format AAAA-MM-JJ.")
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        ctx.error(f"{label} : date invalide « {value} » (format attendu AAAA-MM-JJ).")
        return None


def _str_list(value: Any, label: str, ctx: _Ctx) -> list[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        ctx.error(f"{label} : liste de chaînes attendue.")
        return []
    items: list[str] = []
    for raw in value:
        text = _clean_str(raw)
        if not isinstance(raw, str):
            ctx.error(f"{label} : chaîne attendue, reçu {type(raw).__name__}.")
            continue
        if text:
            items.append(text)
    return items


# ---------------------------------------------------------------------------
# Résolution des objets référencés
# ---------------------------------------------------------------------------


def _resolve_taxonomy(model, values: list[str], label: str, ctx: _Ctx) -> list:
    """Résout des catégories par slug, par nom, ou par chemin « parent/enfant »."""
    if not values:
        return []

    nodes = list(model.objects.all())
    by_slug = {n.slug: n for n in nodes}
    by_name = {_normalize(n.name): n for n in nodes}

    resolved = []
    for raw in values:
        # Un chemin hiérarchique ne sert qu'à lever une ambiguïté de saisie :
        # seule la feuille est rattachée à la fiche.
        leaf = raw.split("/")[-1].strip()
        node = by_slug.get(leaf) or by_slug.get(slugify(leaf)) or by_name.get(_normalize(leaf))
        if node is None:
            ctx.error(
                f"{label} : catégorie inconnue « {raw} ». "
                "Utiliser un slug ou un nom existant de cette taxonomie."
            )
            continue
        if node not in resolved:
            resolved.append(node)
    return resolved


def _resolve_source(raw: Any, label: str, ctx: _Ctx, *, create_sources: bool) -> Source | None:
    """Retrouve une `Source` par URL puis par nom, ou la crée si autorisé."""
    if isinstance(raw, str):
        raw = {"name": raw}
    if not isinstance(raw, dict):
        ctx.error(f"{label} : objet source attendu.")
        return None

    name = _clean_str(raw.get("name"))
    url = _clean_str(raw.get("url"))
    if not name and not url:
        ctx.error(f"{label} : `name` (ou au minimum `url`) est obligatoire.")
        return None

    kind = _clean_str(raw.get("kind"))
    valid_kinds = {choice.value for choice in Source.SourceKind}
    if kind and kind not in valid_kinds:
        ctx.error(f"{label}.kind : valeur invalide « {kind} » (attendu : {', '.join(sorted(valid_kinds))}).")
        kind = ""

    publisher = _clean_str(raw.get("publisher"))
    author = _clean_str(raw.get("author"))
    publication_date = _parse_date(raw.get("publication_date"), f"{label}.publication_date", ctx)
    accessed_date = _parse_date(raw.get("accessed_date"), f"{label}.accessed_date", ctx)

    existing = None
    if url:
        existing = Source.objects.filter(url__iexact=url).first()
    if existing is None and name:
        candidates = Source.objects.filter(name__iexact=name)
        if publisher:
            candidates = candidates.filter(publisher__iexact=publisher)
        existing = candidates.first()
    if existing is not None:
        return existing

    if not create_sources:
        ctx.error(f"{label} : source inconnue « {name or url} » et création de sources désactivée.")
        return None
    if not name:
        ctx.error(f"{label} : `name` est obligatoire pour créer une nouvelle source.")
        return None

    source = Source.objects.create(
        name=name[:200],
        kind=kind,
        url=url,
        publisher=publisher[:200],
        author=author[:200],
        publication_date=publication_date,
        accessed_date=accessed_date,
        notes=_clean_str(raw.get("notes")),
    )
    ctx.created_sources.append(source.name)
    return source


def _build_reference(raw: Any, label: str, ctx: _Ctx, *, create_sources: bool) -> dict | None:
    """Construit la valeur d'un `ReferenceBlock` (source + note + page)."""
    if isinstance(raw, str):
        raw = {"source": {"name": raw}}
    if not isinstance(raw, dict):
        ctx.error(f"{label} : objet référence attendu.")
        return None

    # Tolère la forme aplatie {name, url, ...} en plus de {source: {...}}.
    source_raw = raw.get("source", raw)
    source = _resolve_source(source_raw, f"{label}.source", ctx, create_sources=create_sources)
    if source is None:
        return None

    return {
        "source": source,
        "note": _clean_str(raw.get("note")),
        "page": _clean_str(raw.get("page"))[:60],
    }


def _resolve_card(slug_or_title: str, batch: dict[str, MicroArticlePage]) -> MicroArticlePage | None:
    """Cherche une fiche dans le lot en cours puis en base."""
    key = slugify(slug_or_title)
    if key in batch:
        return batch[key]
    return MicroArticlePage.objects.filter(slug=key).first()


# ---------------------------------------------------------------------------
# Construction des champs
# ---------------------------------------------------------------------------


def _build_key_points(raw: Any, ctx: _Ctx) -> list[tuple[str, str]]:
    points = _str_list(raw, "key_points", ctx)
    if len(points) > MAX_KEY_POINTS:
        ctx.error(f"key_points : {len(points)} items pour un maximum de {MAX_KEY_POINTS}.")
        points = points[:MAX_KEY_POINTS]
    for point in points:
        if len(point) > MAX_KEY_POINT_LEN:
            ctx.error(f"key_points : « {point[:40]}… » dépasse {MAX_KEY_POINT_LEN} caractères.")
    return [("point", point) for point in points]


def _build_sources(raw: Any, ctx: _Ctx, *, create_sources: bool) -> list[tuple[str, dict]]:
    if not isinstance(raw, list) or not raw:
        ctx.error("sources : au moins une source est obligatoire.")
        return []
    if len(raw) > MAX_SOURCES:
        ctx.error(f"sources : {len(raw)} entrées pour un maximum de {MAX_SOURCES}.")
        raw = raw[:MAX_SOURCES]

    blocks = []
    for i, item in enumerate(raw):
        value = _build_reference(item, f"sources[{i}]", ctx, create_sources=create_sources)
        if value is not None:
            blocks.append(("reference", value))
    return blocks


def _build_links(raw: Any, ctx: _Ctx) -> list[tuple[str, dict]]:
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        ctx.error("links : liste attendue.")
        return []
    if len(raw) > MAX_LINKS:
        ctx.error(f"links : {len(raw)} entrées pour un maximum de {MAX_LINKS}.")
        raw = raw[:MAX_LINKS]

    blocks = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            ctx.error(f"links[{i}] : objet attendu.")
            continue
        title = _clean_str(item.get("title"))
        url = _clean_str(item.get("url"))
        if not title or not url:
            ctx.error(f"links[{i}] : `title` et `url` sont obligatoires.")
            continue
        if not url.startswith(("http://", "https://")):
            ctx.error(f"links[{i}].url : URL absolue http(s) attendue.")
            continue
        value = {
            "title": title[:120],
            "url": url,
            "type": _clean_str(item.get("type"))[:40],
            "source": _clean_str(item.get("source"))[:120],
        }
        link_date = _parse_date(item.get("date"), f"links[{i}].date", ctx)
        if link_date is not None:
            value["date"] = link_date
        blocks.append(("link", value))
    return blocks


def _build_see_more(raw: Any, ctx: _Ctx, *, create_sources: bool) -> list[tuple[str, Any]]:
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        ctx.error("see_more : liste de blocs attendue.")
        return []
    if len(raw) > MAX_SEE_MORE_BLOCKS:
        ctx.error(f"see_more : {len(raw)} blocs pour un maximum de {MAX_SEE_MORE_BLOCKS}.")
        raw = raw[:MAX_SEE_MORE_BLOCKS]

    blocks: list[tuple[str, Any]] = []
    for i, item in enumerate(raw):
        label = f"see_more[{i}]"
        if not isinstance(item, dict):
            ctx.error(f"{label} : objet {{type, value}} attendu.")
            continue

        block_type = _clean_str(item.get("type"))
        value = item.get("value")

        if block_type == "detail":
            text = sanitize_rich_text(value) if isinstance(value, str) else ""
            if not text:
                ctx.error(f"{label}.value : texte HTML attendu.")
                continue
            blocks.append(("detail", text))

        elif block_type == "mechanism_3_steps":
            if not isinstance(value, dict):
                ctx.error(f"{label}.value : objet {{target, action, consequence}} attendu.")
                continue
            limits = {"target": 120, "action": 180, "consequence": 180}
            struct = {}
            for key, limit in limits.items():
                text = _clean_str(value.get(key))
                if not text:
                    ctx.error(f"{label}.value.{key} : obligatoire.")
                elif len(text) > limit:
                    ctx.error(f"{label}.value.{key} : dépasse {limit} caractères.")
                struct[key] = text
            blocks.append(("mechanism_3_steps", struct))

        elif block_type in SEE_MORE_LIST_BLOCKS:
            limit = SEE_MORE_LIST_BLOCKS[block_type]
            items = _str_list(value, f"{label}.value", ctx)
            if not 1 <= len(items) <= 8:
                ctx.error(f"{label}.value : entre 1 et 8 items attendus.")
            for entry in items:
                if len(entry) > limit:
                    ctx.error(f"{label}.value : « {entry[:40]}… » dépasse {limit} caractères.")
            blocks.append((block_type, items[:8]))

        elif block_type == "monitoring":
            if not isinstance(value, dict):
                ctx.error(f"{label}.value : objet {{what, why}} attendu.")
                continue
            what = _clean_str(value.get("what"))
            why = _clean_str(value.get("why"))
            if not what or not why:
                ctx.error(f"{label}.value : `what` et `why` sont obligatoires.")
            if len(what) > 140:
                ctx.error(f"{label}.value.what : dépasse 140 caractères.")
            if len(why) > 200:
                ctx.error(f"{label}.value.why : dépasse 200 caractères.")
            blocks.append(("monitoring", {"what": what, "why": why}))

        elif block_type == "references":
            if not isinstance(value, list) or not value:
                ctx.error(f"{label}.value : liste d'au moins une référence attendue.")
                continue
            refs = []
            for j, entry in enumerate(value[:8]):
                ref = _build_reference(entry, f"{label}.value[{j}]", ctx, create_sources=create_sources)
                if ref is not None:
                    refs.append(ref)
            if refs:
                blocks.append(("references", refs))

        elif block_type == "final_summary":
            text = _clean_str(value)
            if not text:
                ctx.error(f"{label}.value : phrase attendue.")
                continue
            if len(text) > 220:
                ctx.error(f"{label}.value : dépasse 220 caractères.")
            blocks.append(("final_summary", text))

        elif block_type == "image":
            # Réservé à un import manuel : le LLM ne connaît pas les images.
            if not isinstance(value, dict):
                ctx.error(f"{label}.value : objet {{image_id, caption}} attendu.")
                continue
            image = _resolve_image(value.get("image_id"), f"{label}.value.image_id", ctx)
            if image is None:
                continue
            blocks.append(("image", {"image": image, "caption": _clean_str(value.get("caption"))[:200]}))

        else:
            ctx.error(
                f"{label}.type : bloc inconnu « {block_type} ». Types acceptés : "
                "detail, mechanism_3_steps, indications, adverse_effects, warnings, "
                "interactions, monitoring, references, final_summary, image."
            )

    return blocks


def _resolve_image(image_id: Any, label: str, ctx: _Ctx):
    from wagtail.images import get_image_model

    if image_id in (None, ""):
        ctx.error(f"{label} : identifiant d'image attendu.")
        return None
    try:
        image_id = int(image_id)
    except (TypeError, ValueError):
        ctx.error(f"{label} : entier attendu.")
        return None
    image = get_image_model().objects.filter(id=image_id).first()
    if image is None:
        ctx.error(f"{label} : image {image_id} introuvable.")
    return image


def _build_questions(raw: Any, ctx: _Ctx, *, create_sources: bool) -> list[Question]:
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        ctx.error("questions : liste attendue.")
        return []

    questions: list[Question] = []
    for i, item in enumerate(raw):
        label = f"questions[{i}]"
        if not isinstance(item, dict):
            ctx.error(f"{label} : objet attendu.")
            continue

        prompt = _clean_str(item.get("prompt"))
        if not prompt:
            ctx.error(f"{label}.prompt : obligatoire.")
            continue
        if len(prompt) > 500:
            ctx.error(f"{label}.prompt : dépasse 500 caractères.")
            continue

        qtype = _clean_str(item.get("type"))
        if qtype not in {c.value for c in Question.QuestionType}:
            ctx.error(f"{label}.type : attendu « qcm » ou « true_false ».")
            continue

        difficulty = item.get("difficulty", 3)
        try:
            difficulty = int(difficulty)
        except (TypeError, ValueError):
            ctx.error(f"{label}.difficulty : entier entre 1 et 5 attendu.")
            continue
        if not 1 <= difficulty <= 5:
            ctx.error(f"{label}.difficulty : valeur entre 1 et 5 attendue.")
            continue

        fields: dict[str, Any] = {
            "type": qtype,
            "explanation": _clean_str(item.get("explanation")),
            "difficulty": difficulty,
        }

        if qtype == Question.QuestionType.QCM:
            answers = item.get("answers")
            if isinstance(answers, list):
                answers = [_clean_str(a) for a in answers]
            else:
                answers = [_clean_str(item.get(f"qcm_answer_{n}")) for n in range(1, 5)]
            if len([a for a in answers if a]) != 4:
                ctx.error(
                    f"{label}.answers : 4 propositions attendues, la bonne réponse en première position."
                )
                continue
            if any(len(a) > 200 for a in answers):
                ctx.error(f"{label}.answers : chaque proposition doit tenir en 200 caractères.")
                continue
            for n, answer in enumerate(answers, start=1):
                fields[f"qcm_answer_{n}"] = answer
        else:
            correct = _clean_str(item.get("correct") or item.get("true_false_correct")).lower()
            if correct in ("vrai", "true"):
                correct = Question.TrueFalseCorrect.TRUE
            elif correct in ("faux", "false"):
                correct = Question.TrueFalseCorrect.FALSE
            else:
                ctx.error(f"{label}.correct : attendu « true » ou « false ».")
                continue
            fields["true_false_correct"] = correct

        source_raw = item.get("source")
        if source_raw:
            source = _resolve_source(source_raw, f"{label}.source", ctx, create_sources=create_sources)
            if source is not None:
                fields["source"] = source

        existing = Question.objects.filter(prompt=prompt, type=qtype).first()
        if existing is not None:
            ctx.reused_questions += 1
            questions.append(existing)
            continue

        question = Question(prompt=prompt, **fields)
        question.save()
        ctx.created_questions += 1
        questions.append(question)

    return questions


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


def _import_one(
    index: int,
    payload: Any,
    batch: dict[str, MicroArticlePage],
    *,
    publish: bool,
    create_sources: bool,
    owner=None,
) -> dict:
    ctx = _Ctx()

    if not isinstance(payload, dict):
        return {"index": index, "ok": False, "errors": ["La carte doit être un objet JSON."], "warnings": []}

    unknown = sorted(set(payload) - CARD_KEYS)
    if unknown:
        ctx.warn(f"Champs ignorés : {', '.join(unknown)}.")

    title = _clean_str(payload.get("title"))
    if not title:
        ctx.error("title : obligatoire (formuler une question).")
    elif len(title) > 255:
        ctx.error("title : dépasse 255 caractères.")

    slug = slugify(_clean_str(payload.get("slug")) or title)
    if not slug:
        ctx.error("slug : impossible à dériver du titre.")
    else:
        clash = MicroArticlePage.objects.filter(slug=slug).first()
        if clash is not None:
            ctx.error(f"slug : « {slug} » est déjà pris par la fiche #{clash.id} « {clash.title} ».")
        elif slug in batch:
            ctx.error(f"slug : « {slug} » est en double dans ce lot.")

    card_type = _clean_str(payload.get("card_type")) or CardType.STANDARD
    if card_type not in {c.value for c in CardType}:
        ctx.error(f"card_type : valeur invalide « {card_type} » (standard, recap ou detail).")
        card_type = CardType.STANDARD

    answer_express = sanitize_rich_text(payload.get("answer_express"))
    if not _plain_len(answer_express):
        ctx.error("answer_express : obligatoire (une phrase construite, pas de puces).")
    elif _plain_len(answer_express) > ANSWER_EXPRESS_SOFT_LIMIT:
        ctx.warn(
            f"answer_express : {_plain_len(answer_express)} caractères "
            f"(cible ≈ {ANSWER_EXPRESS_SOFT_LIMIT})."
        )

    takeaway = sanitize_rich_text(payload.get("takeaway"))
    if takeaway and _plain_len(takeaway) > TAKEAWAY_SOFT_LIMIT:
        ctx.warn(f"takeaway : {_plain_len(takeaway)} caractères (cible ≈ {TAKEAWAY_SOFT_LIMIT}).")

    key_points = _build_key_points(payload.get("key_points"), ctx)
    sources = _build_sources(payload.get("sources"), ctx, create_sources=create_sources)
    links = _build_links(payload.get("links"), ctx)
    see_more = _build_see_more(payload.get("see_more"), ctx, create_sources=create_sources)

    categories: dict[str, list] = {}
    theme_values: list[str] = []
    for field_name, model in TAXONOMIES.items():
        values = _str_list(payload.get(field_name), field_name, ctx)
        if field_name == "categories_theme":
            theme_values = values
        categories[field_name] = _resolve_taxonomy(model, values, field_name, ctx)
    # Une catégorie non résolue a déjà produit son message : ne pas le doubler.
    if not theme_values:
        ctx.error("categories_theme : au moins une catégorie thème est obligatoire.")

    tags = _str_list(payload.get("tags"), "tags", ctx)

    cover_image = None
    if payload.get("cover_image_id") not in (None, ""):
        cover_image = _resolve_image(payload.get("cover_image_id"), "cover_image_id", ctx)

    recap_points_raw = payload.get("recap_points") or []
    if recap_points_raw and card_type != CardType.RECAP:
        ctx.warn("recap_points : ignorés, la carte n'est pas de type « recap ».")
        recap_points_raw = []

    parent = MicroArticleIndexPage.objects.first()
    if parent is None:
        ctx.error("Aucune page d'index de micro-articles n'existe : créez-la d'abord dans Wagtail.")

    questions = _build_questions(payload.get("questions"), ctx, create_sources=create_sources) if not ctx.errors else []

    if ctx.errors:
        return {
            "index": index,
            "ok": False,
            "title": title,
            "slug": slug,
            "errors": ctx.errors,
            "warnings": ctx.warnings,
        }

    page = MicroArticlePage(
        title=title,
        slug=slug,
        card_type=card_type,
        answer_express=answer_express,
        takeaway=takeaway,
        key_points=key_points,
        sources=sources,
        links=links,
        see_more=see_more,
        cover_image=cover_image,
        owner=owner,
        live=False,
    )

    # Modelcluster accepte relations M2M et enfants avant le premier save :
    # `add_child` les persiste ensuite en une fois.
    for field_name, nodes in categories.items():
        if nodes:
            getattr(page, field_name).set(nodes)
    if tags:
        page.tags.add(*tags)
    for question in questions:
        page.microarticle_questions.add(MicroArticleQuestion(question=question))

    for i, item in enumerate(recap_points_raw):
        if isinstance(item, str):
            item = {"text": item}
        if not isinstance(item, dict):
            ctx.warn(f"recap_points[{i}] : ignoré (objet attendu).")
            continue
        text = _clean_str(item.get("text"))
        if not text:
            ctx.warn(f"recap_points[{i}] : ignoré (texte vide).")
            continue
        detail_slug = _clean_str(item.get("detail_card_slug"))
        detail_card = _resolve_card(detail_slug, batch) if detail_slug else None
        if detail_slug and detail_card is None:
            ctx.warn(f"recap_points[{i}] : fiche détail « {detail_slug} » introuvable, point créé sans lien.")
        page.recap_points.add(RecapPoint(text=text[:200], detail_card=detail_card))

    parent.add_child(instance=page)

    related = _str_list(payload.get("related_articles"), "related_articles", ctx)
    if related:
        resolved = []
        for ref in related:
            other = _resolve_card(ref, batch)
            if other is None or other.pk == page.pk:
                ctx.warn(f"related_articles : « {ref} » introuvable, ignoré.")
                continue
            resolved.append(other)
        if resolved:
            page.related_articles.set(resolved)
            page.save()

    subject_payload = payload.get("subject")
    subject_name = None
    if subject_payload:
        if isinstance(subject_payload, str):
            subject_payload = {"name": subject_payload}
        if isinstance(subject_payload, dict):
            name = _clean_str(subject_payload.get("name"))
            subject_slug = slugify(_clean_str(subject_payload.get("slug")) or name)
            subject = Subject.objects.filter(slug=subject_slug).first() if subject_slug else None
            if subject is None and name:
                subject = Subject.objects.create(name=name[:120], slug=subject_slug)
            if subject is None:
                ctx.warn("subject : ignoré (ni `slug` connu, ni `name`).")
            else:
                last = SubjectCard.objects.filter(subject=subject).order_by("-sort_order").first()
                SubjectCard.objects.create(
                    subject=subject,
                    microarticle=page,
                    label=_clean_str(subject_payload.get("label"))[:120],
                    sort_order=(last.sort_order + 1) if last else 0,
                )
                subject_name = subject.name
        else:
            ctx.warn("subject : ignoré (objet ou chaîne attendus).")

    revision = page.save_revision(user=owner)
    if publish:
        # `owner` sert à tracer l'auteur dans le journal Wagtail ; les droits sont
        # déjà vérifiés en amont (staff), et un membre du staff n'a pas forcément
        # de permission de publication sur l'arbre de pages.
        revision.publish(user=owner, skip_permission_checks=True)

    batch[page.slug] = page

    return {
        "index": index,
        "ok": True,
        "id": page.id,
        "slug": page.slug,
        "title": page.title,
        "card_type": page.card_type,
        "status": "published" if publish else "draft",
        "subject": subject_name,
        "created_sources": ctx.created_sources,
        "created_questions": ctx.created_questions,
        "reused_questions": ctx.reused_questions,
        "tags": tags,
        "errors": [],
        "warnings": ctx.warnings,
    }


def import_cards(
    cards: Any,
    *,
    publish: bool = False,
    dry_run: bool = False,
    create_sources: bool = True,
    owner=None,
) -> dict:
    """Importe un lot de fiches ; tout ou rien.

    `dry_run` exécute réellement l'import (résolution des sources, catégories et
    fiches liées comprise) puis annule la transaction : c'est la seule
    validation qui couvre les mêmes cas que l'import réel.
    """
    if isinstance(cards, dict):
        cards = cards.get("cards", [cards])
    if not isinstance(cards, list):
        return {"ok": False, "dry_run": dry_run, "results": [], "detail": "Le JSON doit être une carte ou une liste de cartes."}
    if not cards:
        return {"ok": False, "dry_run": dry_run, "results": [], "detail": "Aucune carte à importer."}

    results: list[dict] = []
    batch: dict[str, MicroArticlePage] = {}

    with transaction.atomic():
        for index, payload in enumerate(cards):
            try:
                # Point de sauvegarde par carte : une erreur d'intégrité sur une
                # carte ne doit pas empêcher de valider les suivantes.
                with transaction.atomic():
                    result = _import_one(
                        index,
                        payload,
                        batch,
                        publish=publish,
                        create_sources=create_sources,
                        owner=owner,
                    )
                    if not result["ok"]:
                        raise CardImportError
            except CardImportError:
                pass
            except Exception as exc:  # noqa: BLE001 - remonté tel quel dans le rapport
                result = {
                    "index": index,
                    "ok": False,
                    "errors": [f"Erreur inattendue : {exc}"],
                    "warnings": [],
                }
            results.append(result)

        ok = all(r["ok"] for r in results)
        if dry_run or not ok:
            transaction.set_rollback(True)

    return {
        "ok": ok,
        "dry_run": dry_run,
        "published": publish and ok and not dry_run,
        "imported": sum(1 for r in results if r["ok"]) if ok and not dry_run else 0,
        "results": results,
    }
