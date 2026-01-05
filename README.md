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

### 2) Lancer les migrations

```bash
python backend/manage.py makemigrations
python backend/manage.py migrate
```

### 3) Créer un superuser

```bash
python backend/manage.py createsuperuser
```

### 4) Lancer le serveur

```bash
python backend/manage.py runserver
```

## URLs

- CMS Wagtail : `http://127.0.0.1:8000/cms/`
- API v2 (contenu Wagtail) :
  - Pages : `GET /api/v2/pages/`
  - Images : `GET /api/v2/images/`
  - Documents : `GET /api/v2/documents/`
- API v1 (produit / DRF) :
  - Feed : `GET /api/v1/feed/?cursor=...&tags=...&q=...&category_pharmacologie=...&category_maladies=...&category_classes=...`
    - Filtres Tree (exact/subtree) :
      - `category_pharmacologie_exact=<node_id>` / `category_pharmacologie_subtree=<node_id>`
      - `category_maladies_exact=<node_id>` / `category_maladies_subtree=<node_id>`
      - `category_classes_exact=<node_id>` / `category_classes_subtree=<node_id>`
      - ou générique : `taxonomy=pharmacologie|maladies|classes&category=<node_id>&scope=exact|subtree`
  - Détail (slug) : `GET /api/v1/micro/<slug>/`
  - Détail (id, interne) : `GET /api/v1/micro/id/<id>/`
  - Resolve category path : `GET /api/v1/categories/resolve/?taxonomy=pharmacologie|maladies|classes&path=diabete/biguanides`
  - Liste : `GET /api/v1/content/microarticles/?tag=...`
  - Détail : `GET /api/v1/content/microarticles/<slug>/`
  - Token auth : `POST /api/v1/auth/token/` (DRF Token)
  - Progress (auth) :
    - `GET /api/v1/learning/progress/`
    - `PATCH /api/v1/learning/progress/<lesson_id>/`
    - `POST /api/v1/learning/progress/import/`

## Modèle de contenu Wagtail

- Créer une page `MicroArticleIndexPage` sous la racine du site.
- Créer des `MicroArticlePage` comme enfants.

Garde-fous appliqués :
- `answer_express` limité à 350 caractères
- `key_points` : 3 à 5 items, 90 caractères max / item
- `links` : max 5
- `see_more` : max 3 blocs

## Postgres (option)

Par défaut la base est SQLite (dev).
Pour Postgres : définir `DATABASE_URL`.
Exemple :

```bash
set DATABASE_URL=postgres://user:password@localhost:5432/pharmapocket
```
