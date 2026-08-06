# PharmaPocket

Socle backend **Django + Wagtail + DRF** pour une app microlearning (headless) :
- CMS Wagtail pour éditer des `MicroArticle` structurés
- Modèle `Question` (stockage dès le départ)
- API `/api/v1` pour catalogue/détail + progression utilisateur

Approche hybride :
- **Wagtail API v2** (`/api/v2`) = contenu éditorial (pages, images, documents)
- **DRF** (`/api/v1`) = produit / métier (progression, feed personnalisé, stats, etc.)

## Démarrage (dev)

### 1) Créer un venv + installer

Depuis la racine du repo :

- créer un venv
- installer les dépendances :

```bash
pip install -r requirements.txt
```

### 2) Configurer l'environnement

Copier `.env.example` vers `.env` et renseigner les variables. `DATABASE_URL` est
**obligatoire** : l'application refuse de démarrer sans elle (voir
[Base de données](#base-de-données)).

```bash
cp .env.example .env
```

### 3) Lancer les migrations

```bash
python backend/manage.py makemigrations
python backend/manage.py migrate
```

### 4) Créer un superuser

```bash
python backend/manage.py createsuperuser
```

### 5) Lancer le serveur

```bash
python backend/manage.py runserver
```

## URLs

> Référence : les urlconfs réels sont `backend/pharmapocket/urls.py`, `backend/pharmapocket/v1_urls.py`,
> `backend/content/urls.py`, `backend/learning/urls.py` et `backend/product/urls.py`.
> En cas de doute, ce sont eux qui font foi.

### Racine

- CMS Wagtail : `http://127.0.0.1:8000/cms/`
- Admin Django : `/django-admin/`
- Auth allauth (pages HTML) : `/accounts/...`
- Auth allauth **headless** (JSON, consommée par le front) : `/auth/browser/v1/...`
- API v2 (contenu Wagtail) : `/api/v2/`
- API v1 (produit / DRF) : `/api/v1/`
- Pages Wagtail servies à la racine : `/`

### API v2 (contenu Wagtail)

- Pages : `GET /api/v2/pages/`
- Images : `GET /api/v2/images/`
- Documents : `GET /api/v2/documents/`

### Authentification

Le projet est en **authentification par session** (cookie), pas en token DRF.
DRF est configuré avec `SessionAuthentication` uniquement, et l'inscription / connexion /
vérification d'email / reset password passent par **django-allauth headless** sous
`/auth/browser/v1/` (ex. `POST /auth/browser/v1/auth/login`,
`GET|POST /auth/browser/v1/auth/session`, `POST /auth/browser/v1/auth/provider/redirect`).

Endpoints applicatifs complémentaires (`/api/v1/auth/`) :

- `GET /api/v1/auth/csrf/` — pose le cookie CSRF (à appeler avant tout POST/PATCH/DELETE,
  puis renvoyer le token dans l'en-tête `X-CSRFToken`)
- `GET /api/v1/auth/me/` *(auth)* — profil courant
- `GET|PATCH /api/v1/auth/account/` *(auth)* — email / username / pseudo
- `POST /api/v1/auth/account/delete/` *(auth)* — suppression de compte (body : `{"password": "..."}`)
- `GET|PATCH /api/v1/auth/preferences/` *(auth)* — `landing_redirect_enabled`,
  `landing_redirect_target` (`start|discover|cards|review|quiz`)

### Taxonomies & tags

Taxonomies disponibles : `theme`, `maladies`, `medicament`, `pharmacologie`
(`classes` est encore accepté comme alias de `theme` sur les vues tree/resolve, mais ne
doit plus être utilisé).

- `GET /api/v1/taxonomies/<taxonomy>/tree/` — arbre complet
- `GET /api/v1/taxonomies/<taxonomy>/resolve/?path=diabete/biguanides` — résolution d'un chemin
- `GET /api/v1/tags/?q=...&limit=...` (limite par défaut 200, max 500)

### Feed & détail micro-article (app `product`)

- `GET /api/v1/feed/` — pagination curseur (`?cursor=...`)
  - Recherche : `q=`
  - Tags : `tags=slug1,slug2`
  - Filtres par slug de catégorie : `category_theme=`, `category_maladies=`,
    `category_medicament=`, `category_pharmacologie=`
  - Filtres arbre (par `node_id`) : `category_<taxonomy>_exact=<node_id>` /
    `category_<taxonomy>_subtree=<node_id>`
  - ou générique : `taxonomy=theme|maladies|medicament|pharmacologie&category=<node_id>&scope=exact|subtree`
- `GET /api/v1/micro/<slug>/`
- `GET /api/v1/micro/id/<id>/` (usage interne)
- `GET /api/v1/categories/resolve/?taxonomy=<taxonomy>&path=diabete/biguanides`

### Contenu (`/api/v1/content/`)

Public :

- `GET /api/v1/content/landing/` — contenu de la landing page Wagtail
- `GET /api/v1/content/microarticles/` — liste paginée (curseur)
  - `q=`, `tags=slug1,slug2` (slugs), `tag=<nom exact>`,
    `taxonomy=<taxonomy>&node=<id>&scope=exact|subtree` (alias : `category=<id>`)
- `GET /api/v1/content/microarticles/<slug>/`
- `GET /api/v1/content/thumb-overrides/`

Utilisateur connecté :

- `GET|POST /api/v1/content/saved/` — micro-articles sauvegardés
- `GET|DELETE /api/v1/content/saved/<slug>/`
- `GET /api/v1/content/read-state/?slugs=a,b,c` · `POST /api/v1/content/read-state/`
- `GET /api/v1/content/sources/search/?q=...`
- Decks :
  - `GET /api/v1/content/decks/?type=...` · `POST /api/v1/content/decks/`
  - `GET|PATCH|DELETE /api/v1/content/decks/<deck_id>/`
  - `POST /api/v1/content/decks/<deck_id>/set-default/`
  - `GET /api/v1/content/decks/<deck_id>/cards/?search=...` · `POST .../cards/`
  - `POST /api/v1/content/decks/<deck_id>/cards/bulk-add/`
  - `DELETE /api/v1/content/decks/<deck_id>/cards/<card_id>/`
  - Decks officiels : `POST .../decks/<deck_id>/start/`, `POST .../decks/<deck_id>/progress/`,
    `POST .../decks/<deck_id>/copy-to-user/`
  - `GET|PUT /api/v1/content/cards/<card_id>/decks/`
- Subjects :
  - `GET /api/v1/content/subjects/?q=...` · `POST /api/v1/content/subjects/`
  - `GET|PATCH|DELETE /api/v1/content/subjects/<slug>/`
  - `GET|POST /api/v1/content/subjects/<slug>/cards/`
  - `POST /api/v1/content/subjects/<slug>/cards/reorder/`
  - `PATCH|DELETE /api/v1/content/subjects/<slug>/cards/<card_id>/`

Staff uniquement (`/api/v1/content/admin/`) :

- `GET|POST /api/v1/content/admin/packs/` · `GET|PATCH|DELETE .../packs/<pack_id>/`
- `POST .../packs/<pack_id>/bulk-add/` · `POST .../packs/<pack_id>/cards/reorder/`
  · `POST .../packs/<pack_id>/cards/<card_id>/remove/`
- `GET /api/v1/content/admin/microarticles/search/` — `q`, `recent`, `tags`,
  `<taxonomy>_nodes` + `<taxonomy>_scope` (`theme`, `maladies`, `medicament`, `pharmacologie`)
- `POST /api/v1/content/admin/images/upload/`
- `GET|POST /api/v1/content/admin/thumb-overrides/`
  · `GET|PATCH|DELETE .../thumb-overrides/<pathology_slug>/`

### Apprentissage (`/api/v1/learning/`, auth requise)

- `GET /api/v1/learning/progress/`
- `PATCH /api/v1/learning/progress/<lesson_id>/`
- `POST /api/v1/learning/progress/import/`
- `GET /api/v1/learning/srs/next/?scope=all_decks|deck|decks|all_cards&deck_id=&deck_ids=&only_due=`
- `POST /api/v1/learning/srs/review/`

## Modèle de contenu Wagtail

- Créer une page `MicroArticleIndexPage` sous la racine du site.
- Créer des `MicroArticlePage` comme enfants.

Garde-fous appliqués :
- `answer_express` limité à 350 caractères
- `key_points` : 3 à 5 items, 90 caractères max / item
- `links` : max 5
- `see_more` : max 3 blocs

## Base de données

Il n'y a **pas de base par défaut** : `DATABASE_URL` doit être définie, sinon le
démarrage échoue avec `RuntimeError: DATABASE_URL environment variable is required`.
Postgres est utilisé en dev comme en production (Clever Cloud).

Exemple (`.env`) :

```bash
DATABASE_URL=postgres://user:password@127.0.0.1:5432/pharmapocket
```

## Données

Les jeux de flashcards d'exemple sont dans [docs/data/](docs/data/) (`question,réponse`,
sans en-tête) — ce sont des données de référence, pas des fixtures chargées
automatiquement.
