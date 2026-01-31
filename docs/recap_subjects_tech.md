---
title: Architecture sujets, cartes récap/détail
summary: Modèles, API et frontend pour les fiches récap, sujets et points récap
---

## Modèles (backend/content/models.py)

### CardType
- `STANDARD`, `RECAP`, `DETAIL` (CharField sur MicroArticlePage `card_type`).

### Subject (snippet)
- Regroupe des cartes via `SubjectCard` (1 récap optionnelle + N détails).
- Champs principaux: `name`, `slug`, `description`.
- Recherche: `search_fields` (title/desc).

### SubjectCard (Orderable)
- Lie un `Subject` à une `MicroArticlePage` (référence), avec `label` et `sort_order`.
- Utilisé pour lister les détails d’un sujet (et récap s’il existe).

### DeckSubject (Orderable)
- Lie un `Deck/Pack` à un `Subject`, avec `sort_order`.

### RecapPoint (Orderable)
- Appartient à une `MicroArticlePage` de type `RECAP` (`recap_card`).
- Champs: `text` (point synthétique), `detail_card` (FK optionnelle vers une fiche `DETAIL`), `sort_order`.
- Admin: InlinePanel sur MicroArticlePage, `PageChooserPanel` pour sélectionner la fiche détail.

### MicroArticlePage
- Nouveau champ `card_type`.
- Panels: InlinePanel `recap_points` (pour cartes récap uniquement).
- Helpers API: `api_recap_points()` (points + détail associé), `get_parent_recap_cards()` (récaps qui pointent vers cette fiche détail).

## Migrations
- `0024_add_subject_and_card_type` : Subject, SubjectCard, DeckSubject, card_type.
- `0025_recappoint` : RecapPoint (points récap avec lien optionnel vers détail).

## API (backend/content/views.py & urls.py)

### MicroArticle
- **List**: `card_type` exposé.
- **Detail**: ajoute `card_type`, `subject`, `detail_cards`, `recap_card`, `recap_points` (si récap), `parent_recap_cards` (liens vers récap pour une fiche détail).

### Subject endpoints
- `GET /api/v1/content/subjects/` (liste, recherche `?q`)
- `POST /api/v1/content/subjects/` (create)
- `GET/PATCH/DELETE /api/v1/content/subjects/<slug>/`
- `GET /api/v1/content/subjects/<slug>/cards/` (SubjectCard list)
- `POST /api/v1/content/subjects/<slug>/cards/` (add card by slug + label)
- `PATCH/DELETE /api/v1/content/subjects/<slug>/cards/<card_id>/`
- `POST /api/v1/content/subjects/<slug>/cards/reorder/` (payload `{order: [ids]}`)

## Frontend (Next.js)

### Types (frontend/src/lib/types.ts)
- `CardType`, `SubjectSummary`, `SubjectDetailCard`, `SubjectRecapCard`.
- `RecapPoint`: `{id, text, sort_order, detail_card?}`.
- `ParentRecapCard`: fiches récap qui pointent vers une fiche détail.
- `MicroArticleDetail`: ajoute `recap_points`, `parent_recap_cards`.

### API client (frontend/src/lib/api.ts)
- Fonctions pour Subject CRUD + gestion des cartes (add/patch/delete/reorder) + fetch detail/list.

### UI
- `SubjectNavigation.tsx` :
  - `RecapPointsList` : liste numérotée des points récap (liens si `detail_card`).
  - `ParentRecapLinks` : liens retour vers fiches récap parentes depuis une fiche détail.
  - `CardTypeBadge` : badge visuel (standard/recap/detail).
- `ReaderClient.tsx` :
  - Affiche `RecapPointsList` pour les cartes `RECAP`.
  - Affiche `ParentRecapLinks` sur les cartes `DETAIL` pour revenir aux récap.
  - Badge `CardTypeBadge` dans l’en-tête.
- `MicroCard.tsx` : badge `CardTypeBadge` dans les listes.

## Flux fonctionnels

### Créer un sujet
1) Créer un `Subject` (admin ou API). 
2) Associer cartes via SubjectCard (une carte de type `RECAP` optionnelle, plusieurs `DETAIL`).
3) (Option) dans la carte récap, ajouter des `RecapPoint` et lier chaque point à une fiche détail.

### Consommation côté lecteur
- Carte `RECAP` : affiche la liste des points, chaque point peut ouvrir sa fiche détail.
- Carte `DETAIL` : montre les récap parentes pour revenir en un clic.
- Substitution/affichage mixte possible via `card_type` côté UI.

## Points d’attention
- `RecapPoint.detail_card` est optionnel : un point peut rester non lié.
- Respecter l’ordre via `sort_order` (InlinePanel ordonnable).
- `PageChooserPanel` requis (évite AppRegistryNotReady lors du chargement des modèles).

## Commandes utiles
```bash
# Migrer
python manage.py migrate

# Vérifier serveur
python manage.py runserver
```
