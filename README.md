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

### Rate limiting

Trois couches, toutes configurables par variables d'environnement (voir `.env.example`) :

| Portée | Quota par défaut | Où |
| --- | --- | --- |
| Anonyme (par IP) | `60/min` | `DJANGO_THROTTLE_RATE_ANON` |
| Authentifié (par compte) | `300/min` | `DJANGO_THROTTLE_RATE_USER` |
| Endpoints sensibles (`/api/v1/auth/account/delete/`) | `5/min` + `30/hour` | `DJANGO_THROTTLE_RATE_SENSITIVE_BURST` / `_SUSTAINED` |

Les endpoints allauth headless (`/auth/…`) ne passent pas par DRF : ils sont couverts
par `ACCOUNT_RATE_LIMITS` (login `10/m/ip`, 5 échecs par compte et par 5 min, signup
`10/m/ip`, reset password `10/m/ip` + `3/m` par adresse). Un dépassement renvoie `429`.

Quatre points à vérifier au déploiement :

- **`DJANGO_BEHIND_PROXY=1`** doit être activé uniquement si Django est toujours
  derrière un reverse proxy contrôlé qui remplace `X-Forwarded-Proto` et
  `X-Forwarded-Host`. Sans cela, la valeur doit rester `0` (défaut sécurisé).
- **`DJANGO_TRUSTED_PROXY_COUNT`** doit correspondre au nombre réel de reverse proxies.
  Les compteurs identifient le client par la N-ième entrée de `X-Forwarded-For` **en
  partant de la fin** ; une valeur trop basse laisse un client forger son identité,
  une valeur trop haute met tout le monde dans le même compteur.
- **`DJANGO_THROTTLE_EXEMPT_IPS`** doit contenir l'adresse du front Next.js si celui-ci
  appelle l'API en SSR : sinon tous les visiteurs partagent le quota anonyme de ce serveur.
- **`DJANGO_CACHE_URL`** (Redis) rend les quotas globaux. Sans lui, le cache local à
  chaque worker gunicorn multiplie de fait la limite par le nombre de workers.
  Le backend Redis est fourni par Django mais nécessite le client : `pip install redis`.

Les journaux Django et applicatifs sont écrits sur la console avec un format commun
(`date`, niveau, logger, message). `DJANGO_LOG_LEVEL` fixe le seuil global ; son défaut
est `DEBUG` lorsque `DJANGO_DEBUG=1`, sinon `INFO`.

### Recherche

Le paramètre `q` de `GET /api/v1/content/microarticles/` et de
`GET /api/v1/content/admin/microarticles/search/` interroge le **backend de recherche
Wagtail** (full-text Postgres, table `wagtailsearch_indexentry` avec index GIN), et non
des `LIKE`. Concrètement : « insuline » remonte « Insulines lentes », le texte des
StreamField (`key_points`, `see_more`) est cherchable, et les accents sont ignorés.

| | Feed public | Sélecteur back-office |
| --- | --- | --- |
| Méthode | `search()` (mots entiers, radicaux français) | `autocomplete()` (dernier mot = préfixe) |
| Champs | titre, réponses, takeaway, StreamField | titre, slug |
| Déclencheur côté front | validation du formulaire | frappe en cours |

Le feed retente en préfixe quand aucun mot entier ne correspond : « amoxi » remonte
« Amoxicilline » au lieu d'une page vide.

Les accents ne sont pas gérés par Postgres (l'extension `unaccent` n'est pas requise) mais
par une copie translittérée en ASCII des champs indexés, côté modèle
(`MicroArticlePage.search_normalized`) ; `content.search` translittère la requête de la
même façon.

**À l'exploitation :**

- L'index est mis à jour à l'enregistrement d'une page (signaux Wagtail). Après un import
  massif, une restauration de base, ou toute modification des `search_fields` du modèle
  ou des variables ci-dessous, il faut le reconstruire :

  ```bash
  python backend/manage.py update_index
  ```

- `DJANGO_SEARCH_CONFIG` (défaut `french`) est la configuration de recherche Postgres
  utilisée à l'indexation **et** à l'interrogation : elle fournit les radicaux et les mots
  vides. `DJANGO_SEARCH_AUTOCOMPLETE_CONFIG` (défaut `simple`) reste sans radicaux, sinon
  la recherche par préfixe ne fonctionne plus.
- Si le backend de recherche tombe, les vues se rabattent sur un filtre `icontains` et
  l'incident est journalisé (`content.search`) : la recherche se dégrade au lieu de
  renvoyer zéro résultat.

### Upload d'images

`POST /api/v1/content/admin/images/upload/` *(staff)* crée une image Wagtail à partir d'un
multipart (`file` ou `image`, `title` optionnel). La vue n'utilise pas le formulaire Wagtail :
elle rejoue ses validations via `WagtailImageField`, donc un fichier refusé renvoie `400`
avec le détail sous la clé `file`. Sont vérifiés l'extension (`WAGTAILIMAGES_EXTENSIONS`,
SVG exclu volontairement), la correspondance entre extension et format réel du fichier, la
taille (`DJANGO_MAX_IMAGE_UPLOAD_SIZE`, 10 Mo par défaut) et le nombre de pixels
(`WAGTAILIMAGES_MAX_IMAGE_PIXELS`, défaut Wagtail de 128 Mpx, contre les *decompression bombs*).

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
- `POST /api/v1/content/admin/microarticles/import/` — création de fiches depuis
  un JSON éditorial (voir [docs/prompt_generation_cartes.md](docs/prompt_generation_cartes.md))
- `POST /api/v1/content/admin/taxonomies/<taxonomy>/nodes/` — création d'une
  catégorie (`name`, `slug` optionnel, `parent_id` optionnel)
- `POST /api/v1/content/admin/images/upload/`
- `GET|POST /api/v1/content/admin/thumb-overrides/`
  · `GET|PATCH|DELETE .../thumb-overrides/<pathology_slug>/`

### Apprentissage (`/api/v1/learning/`, auth requise)

- `GET /api/v1/learning/progress/`
- `PATCH /api/v1/learning/progress/<lesson_id>/`
- `POST /api/v1/learning/progress/import/`
- `GET /api/v1/learning/srs/next/?scope=all_decks|deck|decks|all_cards&deck_id=&deck_ids=&only_due=`
- `POST /api/v1/learning/srs/review/`

### Contrat OpenAPI et types frontend

Le schéma OpenAPI v1 est exposé publiquement par `GET /api/schema/` et sa version
de référence est suivie dans `openapi/schema.yaml`. Les types de
`frontend/src/lib/types.ts` sont générés depuis ce fichier ; il ne faut pas les
modifier à la main.

```bash
python backend/manage.py spectacular --urlconf pharmapocket.schema_urls --file openapi/schema.yaml --validate --fail-on-warn
cd frontend
npm run types:generate
npm run types:check
```

Le workflow `openapi-contract.yml` régénère le schéma en CI et échoue si le
schéma suivi ou les types générés ne sont plus synchronisés.

## Modèle de contenu Wagtail

- Créer une page `MicroArticleIndexPage` sous la racine du site.
- Créer des `MicroArticlePage` comme enfants.

Garde-fous appliqués :
- `answer_express` limité à 350 caractères
- `key_points` : 3 à 5 items, 90 caractères max / item
- `links` : max 5
- `see_more` : max 3 blocs

### Import de fiches (JSON généré par IA)

Le format JSON, le prompt de génération et la boucle de travail sont décrits dans
[docs/prompt_generation_cartes.md](docs/prompt_generation_cartes.md). Trois portes
d'entrée pour le même import :

- l'app : **Admin → Import de fiches (JSON)** (`/admin/import`, staff) — génère
  aussi le prompt, taxonomies injectées, et propose de créer les catégories
  manquantes ;
- la ligne de commande :

  ```bash
  python manage.py import_cards fiches.json --dry-run   # valide sans écrire
  python manage.py import_cards fiches.json             # crée en brouillon
  python manage.py import_cards fiches.json --publish   # crée et publie
  python manage.py import_cards fiches.json --update    # réécrit les slugs existants
  ```

- l'API : `POST /api/v1/content/admin/microarticles/import/`.

L'import est tout-ou-rien, crée les fiches en brouillon par défaut, et crée à la
volée les sources, tags et sujets manquants. Une catégorie inconnue ne bloque pas
définitivement : elle est renvoyée dans `unknown_categories`, et la page d'import
propose de la créer (nom, slug et parent éditables) avant de relancer.

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
