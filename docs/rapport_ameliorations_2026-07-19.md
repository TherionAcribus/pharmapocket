# PharmaPocket — Rapport d'audit et pistes d'amélioration

> Date : 2026-07-19. Ce rapport est destiné à être fourni à un LLM (ou un développeur) comme feuille de route. Chaque point décrit le problème, sa localisation exacte, la solution proposée et une priorité (P1 = à faire en premier, P3 = confort).

## Contexte du projet

Application de microlearning pharma, monorepo :

- **Backend** : Django 5.2 + Wagtail 7.2 (CMS headless) + DRF, dans `backend/`. Apps : `content` (fiches MicroArticle, decks/packs, sujets, taxonomies), `learning` (progression, SRS Leitner), `users` (User custom + allauth headless, Google OAuth), `product`. Auth par session + CSRF, frontend sur un autre domaine (CORS + SameSite=None).
- **Frontend** : Next.js 16 / React 19 + Tailwind 4 + shadcn/Radix, dans `frontend/`. Client API maison dans `frontend/src/lib/api.ts`, types maintenus à la main dans `frontend/src/lib/types.ts`.
- **Déploiement** : Clever Cloud (d'où le `manage.py` wrapper à la racine), gunicorn + whitenoise, Postgres via `DATABASE_URL`.

L'état général est bon : settings de sécurité soignés (HSTS, cookies, sanitization HTML via bleach dans `backend/content/html.py`, tests de fuite de contenu non publié). Les problèmes sont surtout de la dette de structure, des N+1, et des trous de validation/tests.

---

## 1. Bugs et nettoyages immédiats (P1)

### 1.1 `print()` de debug en production
- **Problème** : `MicroArticleDetailView` contient deux `print()` de debug qui s'exécutent à chaque requête de détail d'une fiche (`backend/content/views.py:697` et `views.py:716-725`).
- **Solution** : supprimer, ou remplacer par `logger.debug(...)` (un `logger = logging.getLogger(__name__)` existe déjà ligne 43).

### 1.2 `console.log` restants côté frontend
- **Problème** : 3 `console.log/debug` dans `frontend/src/app/micro/[slug]/ReaderClient.tsx`.
- **Solution** : supprimer, et ajouter la règle ESLint `no-console` (avec `allow: ["warn", "error"]`) dans `frontend/eslint.config.mjs`.

### 1.3 README obsolète / API drift
- **Problème** : le `README.md` documente des routes qui n'existent pas ou plus : `/api/v1/feed/`, `/api/v1/micro/<slug>/`, `/api/v1/micro/id/<id>/`, `/api/v1/auth/token/` (DRF Token — le projet est en auth session), les filtres `category_pharmacologie_exact/subtree`, la taxonomie `classes`. Les vraies routes sont dans `backend/pharmapocket/v1_urls.py` et `backend/content/urls.py` (`/api/v1/content/microarticles/`, `/api/v1/content/decks/`, `/api/v1/taxonomies/<taxonomy>/tree/`, etc.).
- **Solution** : réécrire la section « URLs » du README depuis les urlconfs réels, et supprimer la mention du token DRF. Idéalement, générer un schéma OpenAPI (voir §4.1) et pointer le README dessus.
- **Statut (2026-08-06)** : ✅ section « URLs » du README réécrite depuis les urlconfs réels. Précision sur le diagnostic : `/api/v1/feed/`, `/api/v1/micro/<slug>/`, `/api/v1/micro/id/<id>/` et `/api/v1/categories/resolve/` **existent bel et bien** (`backend/product/urls.py`, monté à la racine de `/api/v1/` via `path("", include("product.urls"))`), de même que les filtres `category_pharmacologie_exact/subtree`. Ce qui était réellement faux : `POST /api/v1/auth/token/` (aucun `authtoken` installé, DRF est en `SessionAuthentication` + allauth headless) et la taxonomie `classes` (renommée `theme` ; encore acceptée comme alias sur les vues tree/resolve, absente des filtres du feed, et `medicament` manquait). Reste à faire : le schéma OpenAPI de §4.1.

### 1.4 Fichiers parasites versionnés
- **Problème** : `flashcards.csv` et `flashcards (1).csv` sont trackés à la racine du repo ; `db.sqlite3` traîne à la racine (ignoré mais présent, et le README parle encore de SQLite par défaut alors que `settings.py` exige `DATABASE_URL`).
- **Solution** : `git rm --cached "flashcards.csv" "flashcards (1).csv"`, les déplacer hors du repo (ou dans `docs/data/` si utiles), et mettre à jour le README sur le point base de données.
- **Statut (2026-08-06)** : ✅ les deux CSV contiennent des jeux de flashcards distincts et exploitables (VIH/dépistage/PrEP et zona) ; ils ont été déplacés via `git mv` vers `docs/data/flashcards-vih-depistage.csv` et `docs/data/flashcards-zona.csv` (historique conservé, plus de nom avec espace/parenthèses). `db.sqlite3` à la racine était vide (0 octet) et a été supprimé ; il reste couvert par `.gitignore`. README : la section « Postgres (option) » devient « Base de données » et indique que `DATABASE_URL` est obligatoire, une étape « Configurer l'environnement » (copie de `.env.example`) est ajoutée au démarrage dev, et une section « Données » pointe vers `docs/data/`.

### 1.5 Énumération d'utilisateurs par timing sur le login pseudo
- **Problème** : `PseudoAuthenticationBackend.authenticate` (`backend/users/auth_backends.py`) retourne immédiatement si le pseudo n'existe pas, mais fait un `check_password` (coûteux, ~100 ms) si le pseudo existe → un attaquant peut déterminer quels pseudos existent en mesurant le temps de réponse.
- **Solution** : quand `user is None`, exécuter quand même un hash factice : `from django.contrib.auth.hashers import make_password, check_password` et comparer contre un hash bidon (pattern utilisé par `ModelBackend` avec `User().set_password()` / `UserModel().check_password(password)`).
- **Statut (2026-08-06)** : ✅ `PseudoAuthenticationBackend.authenticate` appelle `user_model().set_password(password)` avant de retourner `None` sur un pseudo inconnu (pattern `ModelBackend`), ce qui aligne le coût du chemin « pseudo inexistant » sur celui du chemin nominal. Fuite de timing supplémentaire trouvée au passage et corrigée : le test `is_active` était fait **avant** `check_password`, donc un compte désactivé répondait aussi vite qu'un pseudo inconnu ; l'ordre est inversé (mot de passe vérifié d'abord, statut ensuite). Tests ajoutés dans `backend/users/tests.py` (7 tests, dont deux qui vérifient par mock que le hachage a bien lieu sur les deux chemins d'échec).

### 1.6 Pas de rate limiting sur les endpoints sensibles
- **Problème** : aucun throttling DRF configuré (`REST_FRAMEWORK` dans `backend/pharmapocket/settings.py` n'a pas de `DEFAULT_THROTTLE_CLASSES`), et rien devant les endpoints allauth headless (`/auth/…` : login, signup, reset password) ni `DeleteAccountView`. Brute-force possible.
- **Solution** : activer `AnonRateThrottle`/`UserRateThrottle` globalement (ex. `anon: 60/min`, `user: 300/min`) + un scope serré pour l'auth. allauth a `ACCOUNT_RATE_LIMITS` (activé par défaut mais à vérifier/configurer explicitement). En complément, un rate-limit au niveau reverse proxy.
- **Statut (2026-08-06)** : ✅ throttling DRF global (`anon: 60/min`, `user: 300/min`) + scope serré (`5/min` et `30/hour`, par compte) sur `DeleteAccountView`, qui vérifie un mot de passe. `ACCOUNT_RATE_LIMITS` est désormais explicite (login `10/m/ip`, `login_failed` 5 essais/5 min par compte, signup `10/m/ip`, reset password `10/m/ip` + `3/m` par adresse) — les défauts allauth étaient actifs mais laxistes. Toutes les valeurs sont pilotables par variables d'environnement (`.env.example` + section « Rate limiting » du README). Trois trous trouvés en implémentant : (1) DRF **et** allauth identifient le client par l'entrée la **plus à gauche** de `X-Forwarded-For`, forgeable par le client, ce qui donne un compteur neuf à chaque requête — `pharmapocket/throttling.py::get_client_ip` lit désormais la N-ième entrée en partant de la fin (`DJANGO_TRUSTED_PROXY_COUNT`, 1 en prod) et `users.adapters.AccountAdapter.get_client_ip` l'utilise pour allauth ; (2) le front Next.js appelle l'API en SSR, donc tous les visiteurs partageraient un seul quota anonyme → `DJANGO_THROTTLE_EXEMPT_IPS` (IP/CIDR) exempte les clients internes ; (3) sans cache partagé, chaque worker gunicorn compte pour lui seul → `DJANGO_CACHE_URL` (Redis) configure le cache par défaut, LocMem sinon. 12 tests dans `backend/pharmapocket/tests.py`. Reste optionnel : le rate-limit au niveau du reverse proxy (Clever Cloud).

### 1.7 Upload d'images sans validation
- **Problème** : `AdminImageUploadView` (`backend/content/views.py:1899`) accepte n'importe quel fichier sans vérifier type ni taille, et l'enregistre directement comme image Wagtail (sans passer par le formulaire Wagtail qui valide normalement le format).
- **Solution** : valider avant `image.save()` : extension/type réel (la lib `filetype` est déjà dans `requirements.txt`, ou `PIL.Image.open(...).verify()`), taille max (ex. 10 Mo), et renvoyer une 400 propre. Réutiliser `WAGTAILIMAGES_EXTENSIONS` si possible.
- **Statut (2026-08-06)** : ✅ `AdminImageUploadView` passe l'`UploadedFile` dans `WagtailImageField().clean()` avant de construire l'image ; une `ValidationError` Django est traduite en `DRFValidationError({"file": [...]})`, donc `400` avec un message lisible. Plutôt que `filetype`/`PIL.verify()` à la main, c'est exactement le champ que le formulaire Wagtail utilise : on récupère d'un coup l'extension autorisée (`WAGTAILIMAGES_EXTENSIONS`), la **cohérence extension / format réel** (un `.png` qui contient autre chose est refusé), la taille max et le garde-fou pixels (`WAGTAILIMAGES_MAX_IMAGE_PIXELS`, 128 Mpx par défaut, contre les *decompression bombs*) — ce dernier n'était pas dans le rapport et n'aurait pas été couvert par une validation maison. `WAGTAILIMAGES_EXTENSIONS` et `WAGTAILIMAGES_MAX_UPLOAD_SIZE` sont désormais explicites dans `settings.py` : les défauts Wagtail convenaient déjà (10 Mo, pas de SVG), mais ils étaient implicites et la taille n'était pas pilotable — elle l'est via `DJANGO_MAX_IMAGE_UPLOAD_SIZE`. 5 tests dans `backend/content/tests.py` (PNG valide, non-image déguisée en `.png`, extension interdite, fichier trop gros, non-staff).

---

## 2. Performance (P2)

### 2.1 N+1 systémique via `_microarticle_list_item`
- **Problème** : `_microarticle_list_item` (`backend/content/views.py:314`) appelle `p.tags.values_list(...)` pour chaque carte. Les vues qui l'utilisent (`SavedMicroArticleListView`, `DeckCardsView`, `DeckDetailView`, `AdminPackDetailView`) font `select_related("microarticle", "microarticle__cover_image")` mais **pas** `prefetch_related("microarticle__tags")` → 1 requête SQL par carte pour les tags. Un deck de 100 cartes ≈ 100 requêtes en plus.
- **Solution** : ajouter `.prefetch_related("microarticle__tags")` sur tous les querysets `DeckCard` qui alimentent `_microarticle_list_item`.

### 2.2 N+1 sur la liste des sujets
- **Problème** : `SubjectListCreateView.get` (`backend/content/views.py:2219`) fait `s.subject_cards.count()` et `s.subject_cards.filter(...).exists()` dans la boucle → 2 requêtes par sujet (jusqu'à 100 sujets = 200 requêtes).
- **Solution** : annoter le queryset : `Subject.objects.annotate(cards_count=Count("subject_cards"), has_recap=Exists(SubjectCard.objects.filter(subject=OuterRef("pk"), microarticle__card_type=CardType.RECAP)))`.

### 2.3 Écritures en boucle
- **Problème** : `SubjectCardsReorderView` (`views.py:2507`) fait un `save()` par carte ; `AdminPackBulkAddView` (`views.py:1942`) fait un `save()` + 2 requêtes de lookup par token.
- **Solution** : pour le reorder, collecter puis `bulk_update(links, ["sort_order"])` (comme le fait déjà `AdminPackReorderCardsView`, à prendre pour modèle). Pour le bulk-add : résoudre tous les ids et slugs en 2 requêtes (`filter(id__in=…)` / `filter(slug__in=…)`) puis `bulk_create`.
- **Statut (2026-08-06)** : ✅ les deux vues font désormais un nombre de requêtes constant. `SubjectCardsReorderView` (`views.py:2535`) suit le modèle de `AdminPackReorderCardsView` : les liens dont le `sort_order` change sont collectés puis écrits en un seul `bulk_update`, et la réponse renvoie `updated` (nombre de liens réellement déplacés) en plus de `ok`. `AdminPackBulkAddView` (`views.py:1960`) résout tous les tokens en 2 requêtes (`in_bulk` sur les ids numériques + `filter(slug__in=…)` sur les slugs) puis insère en un seul `bulk_create` ; l'ordre de traitement des tokens, la déduplication (via `existing_ids`, qui couvre aussi les doublons *dans* la liste envoyée) et les compteurs `added` / `already_present` / `not_found` sont inchangés. `DeckCard` et `SubjectCard` sont des `Orderable` sans `save()` surchargé, donc `bulk_create`/`bulk_update` ne court-circuitent aucune logique. 5 tests dans `backend/content/tests.py` (`BulkWriteQueryCountTests`) : 2 tests de constance du nombre de requêtes (2 vs 6 cartes — ils échouent bien sur l'ancien code : 4→8 pour le reorder, 7→15 pour le bulk-add) et 3 tests de comportement (ordre appliqué, ids inconnus ignorés, résolution mixte id/slug + compteurs).

### 2.4 Recherche plein-texte en `icontains`
- **Problème** : le filtre `q` de `MicroArticleListView` et de `AdminMicroArticleSearchView` fait des `icontains` sur `title`/`answer_express` (scan séquentiel, insensible aux accents seulement partiellement, ne matche pas le contenu StreamField).
- **Solution** : à court terme acceptable. Moyen terme : utiliser le backend de recherche Wagtail (`MicroArticlePage.objects.live().search(q)`) — les `search_fields` sont déjà déclarés sur le modèle — ou l'extension Postgres `pg_trgm` avec un index GIN.
- **Statut (2026-08-06)** : ✅ les deux vues passent par le backend de recherche Wagtail via `backend/content/search.py`. Trois points ont demandé plus que le `search(q)` du rapport. (1) **Le backend renvoie un `SearchResults`, pas un queryset** : le brancher directement aurait cassé la pagination curseur de `MicroArticleListView` et le `.distinct()` combiné aux filtres taxonomie (`SELECT DISTINCT` + `ORDER BY rank` est refusé par Postgres). Le module récupère donc les ids (plafonnés à 500) et les réinjecte en `pk__in`, ce qui laisse aux vues leur tri, leurs `select_related`/`prefetch_related` et leur curseur. (2) **Recherche ≠ autocomplétion** : le feed public cherche à la validation du formulaire (`search()`, mots entiers), alors que le sélecteur de fiches du back-office interroge l'API à chaque frappe — `search()` seul y aurait été une régression (« metfor » ne matche rien) ; il utilise `autocomplete()`, dont le dernier terme est traité comme un préfixe, sur `title` + `slug`. Le feed public retente lui aussi en préfixe, mais seulement quand aucun mot entier ne correspond, pour ne pas renvoyer une page vide à quelqu'un qui tape « amoxi ». (3) **Les accents** : ni la config `french` ni `simple` ne les ignore, et `unaccent` aurait imposé un `CREATE EXTENSION` sur l'add-on Clever Cloud ; `MicroArticlePage` indexe donc une copie translittérée en ASCII (`anyascii`, déjà une dépendance de Wagtail) de ses champs textuels, et `content.search` translittère la requête de la même façon. `search_fields` couvre en plus `answer_detail`, `takeaway`, `key_points` et `see_more` — le contenu des StreamField devient cherchable. `WAGTAILSEARCH_BACKENDS` est explicite dans les settings (`DJANGO_SEARCH_CONFIG=french`, `DJANGO_SEARCH_AUTOCOMPLETE_CONFIG=simple`) ; les index GIN de `wagtailsearch_indexentry` existent déjà via les migrations Wagtail, donc pas de `pg_trgm` à installer. Repli `icontains` journalisé si le backend tombe, pour dégrader la recherche au lieu de renvoyer zéro résultat. **Au déploiement : `manage.py update_index` est requis une fois** (l'index existant ne contient ni les nouveaux champs ni les copies translittérées) — voir la section « Recherche » du README. 12 tests dans `backend/content/tests.py` (variantes morphologiques, accents, StreamField, combinaison avec les filtres, brouillons exclus, préfixe et slug côté back-office, repli). À noter pour la suite : `DeckCardsView` garde un `icontains` sur le titre, mais il porte sur les cartes d'un seul deck.

### 2.5 Logique « progress » dupliquée
- **Problème** : le calcul `effective = max(done, seen)` + `progress_pct` + rattrapage `seen` depuis `last_card_id`/`sort_order` est copié-collé 4 fois (`DeckListCreateView.get`, `DeckDetailView.get`, `OfficialDeckStartView.post`, `OfficialDeckProgressView.post`).
- **Solution** : extraire une fonction `build_progress_payload(progress, deck, cards_count) -> dict` unique. Réduit le risque d'incohérence entre les écrans.

---

## 3. Architecture backend (P2)

### 3.1 `content/views.py` = 2533 lignes
- **Problème** : un seul fichier mélange feed public, decks utilisateur, packs officiels, admin packs, subjects, thumb overrides, upload d'images. Difficile à naviguer et à tester.
- **Solution** : éclater en package `content/views/` : `feed.py`, `decks.py`, `packs_admin.py`, `subjects.py`, `thumbs.py`, `helpers.py` (avec un `__init__.py` qui réexporte pour ne pas casser `content/urls.py`).

### 3.2 Validation manuelle au lieu de serializers DRF
- **Problème** : presque toutes les vues valident `request.data` à la main (`payload = request.data if isinstance(request.data, dict) else {}` + cascades de `isinstance`). C'est ~40 % du volume de `views.py`, avec des formats d'erreur hétérogènes.
- **Solution** : un serializer DRF d'entrée par endpoint (ex. `PackCreateSerializer`, `ThumbOverrideSerializer`, `DeckPatchSerializer`) avec `serializer.is_valid(raise_exception=True)`. Gain : moins de code, erreurs 400 cohérentes, doc auto si OpenAPI.

### 3.3 Trois chemins de sérialisation pour la même fiche
- **Problème** : une `MicroArticlePage` est sérialisée par (a) les méthodes `api_*` du modèle (`backend/content/models.py:763-888`, pour l'API Wagtail v2), (b) `_microarticle_list_item` + helpers dans `content/views.py`, (c) des helpers dupliqués dans `backend/learning/views.py:224-261` (`_cover_url`, `_cover_credit`, `_key_points`, `_card_payload`). Toute évolution du payload doit être faite 3 fois.
- **Solution** : centraliser dans `content/serializers.py` (un `MicroArticleCardSerializer` réutilisé partout, y compris par `learning`), et supprimer les copies.

### 3.4 Permissions staff : mixin plutôt que garde manuelle
- **Problème** : le pattern `denied = _require_staff(request); if denied is not None: return denied` est répété ~20 fois.
- **Solution** : une classe `IsStaff(BasePermission)` (`has_permission = user.is_authenticated and user.is_staff`) posée dans `permission_classes` des vues admin. Supprime toutes les gardes manuelles.

### 3.5 `_get_or_create_default_deck` non atomique
- **Problème** : (`backend/content/views.py:292`) deux requêtes concurrentes du même user peuvent tenter de créer « Mes cartes » en même temps ; la contrainte `uniq_deck_default_per_user` fera échouer la seconde en `IntegrityError` 500.
- **Solution** : entourer d'un `try/except IntegrityError` avec re-lecture, ou utiliser `get_or_create(user=…, type=USER, is_default=True, defaults={…})` dans une transaction.

### 3.6 `BaseCategory.save()` détourne la création treebeard
- **Problème** : (`backend/content/models.py:358-373`) le `save()` crée un root node et patch `self.pk/path/depth` à la main pour contourner l'admin Wagtail. Fragile (toute catégorie créée hors admin devient racine silencieusement).
- **Solution** : à défaut d'une vraie UI d'arbre, documenter la limite dans le code et créer les hiérarchies via une management command ou l'admin Django. Option plus propre : formulaire snippet custom avec choix du parent qui appelle `add_child`.

### 3.7 Settings : durcissements mineurs
- `REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] = AllowAny` : passer à `IsAuthenticated` par défaut et déclarer explicitement `AllowAny` sur les vues publiques (fail-closed au lieu de fail-open).
- `SECURE_PROXY_SSL_HEADER` + `USE_X_FORWARDED_HOST` sont actifs même en dev/hors proxy : les conditionner à une env var (`DJANGO_BEHIND_PROXY=1`) pour éviter le spoofing d'hôte si le backend est un jour exposé sans proxy.
- Ajouter `LOGGING` structuré (au moins console + niveau par env) — actuellement aucun logging configuré.

---

## 4. Contrat API et types frontend (P2)

### 4.1 Pas de schéma OpenAPI, types TS maintenus à la main
- **Problème** : `frontend/src/lib/types.ts` (320 lignes) est écrit à la main et doit rester synchronisé avec des payloads construits en dicts Python. Le drift est déjà visible (cf. §1.3). C'est la source de bugs la plus probable à mesure que l'API grossit.
- **Solution** : ajouter `drf-spectacular`, annoter les vues (ou mieux : les serializers du §3.2 rendent ça quasi gratuit), exposer `/api/schema/`, puis générer les types côté front avec `openapi-typescript`. Ajouter un step CI qui échoue si les types générés diffèrent.

### 4.2 Client API frontend : duplication et gestion d'erreur
- **Problème** : dans `frontend/src/lib/api.ts`, `apiGet`, `apiJson` et `apiPostOkOr401` dupliquent 3 fois le même bloc de parsing d'erreur ; les erreurs sont des `Error` avec un message JSON brut, difficile à exploiter pour l'UI (impossible de distinguer 401/403/404 proprement).
- **Solution** : factoriser un `handleResponse<T>(res)` unique et lancer une classe `ApiError extends Error { status: number; body: unknown }`. Les pages peuvent alors faire du branching sur `err.status`.

### 4.3 Data-fetching manuel
- **Problème** : les pages (`cards/page.tsx`, `review/page.tsx`, `FeedClient.tsx`, etc.) gèrent à la main loading/error/refetch avec `useState`/`useEffect`. Beaucoup de code répété, pas de cache ni de dédoublonnage de requêtes.
- **Solution** : introduire TanStack Query (React Query) : `useQuery`/`useMutation` autour des fonctions existantes de `api.ts`. Migration incrémentale possible page par page.

### 4.4 Fichiers frontend monolithiques
- **Problème** : `ReaderClient.tsx` fait 1275 lignes, `api.ts` 1124, `admin/packs/[id]/page.tsx` 809.
- **Solution** : découper `ReaderClient` en sous-composants (header, quiz, see-more, navigation sujet, actions deck) ; découper `api.ts` par domaine (`api/feed.ts`, `api/decks.ts`, `api/auth.ts`, `api/srs.ts`, `api/admin.ts`) avec un module `api/client.ts` commun.

---

## 5. Tests et CI (P1–P2)

### 5.1 Couverture de tests très faible
- **Problème** : ~286 lignes de tests au total (`content/tests.py`, `learning/tests.py`) pour ~40 endpoints. Zones critiques non testées : isolation entre utilisateurs (le user A ne doit pas lire/modifier les decks du user B — `DeckDetailView`, `DeckCardsView`, `CardDecksView`), fusion de progression (`_merge_progress`, logique de conflit offline), SRS (`next_leitner_state` + `SRSNextView` avec ses 4 scopes), création du deck par défaut, endpoints admin (staff vs non-staff).
- **Solution** (ordre de priorité) :
  1. Tests d'autorisation croisée sur tous les endpoints deck/saved/read-state (user B → 404).
  2. Tests unitaires purs de `_merge_progress` et `next_leitner_state` (rapides, sans DB).
  3. Tests du cycle SRS : review → due_at repoussé → `next` renvoie la bonne carte selon `scope`/`only_due`.
  4. Test de `OfficialDeckCopyToUserView` (copie, collision de nom, cartes non publiées exclues).

### 5.2 Aucune CI
- **Problème** : pas de `.github/workflows`. Rien ne garantit que les tests passent ni que le front build.
- **Solution** : un workflow GitHub Actions avec 2 jobs : backend (`pip install -r requirements.txt`, `ruff check`, `python manage.py test` sur Postgres en service) et frontend (`npm ci`, `npm run lint`, `tsc --noEmit`, `npm run build`).

### 5.3 Pas de linter/formatteur backend
- **Problème** : pas de ruff/black configuré ; `requirements.txt` mélange deps de prod et outils.
- **Solution** : ajouter `ruff` (lint + format) avec un `pyproject.toml` minimal, et séparer `requirements-dev.txt`. Optionnel : pre-commit.

---

## 6. Points produit / fonctionnels à trancher (P3)

- **Réponses de quiz visibles dans l'API** : `correct_answers` est envoyé au client avec la question (`_questions_payload`) et la bonne réponse QCM est toujours à l'index 0 (`Question._sync_legacy_json_fields`). Nécessité absolue de mélanger côté client (à vérifier dans `app/quiz`), et accepter qu'un utilisateur motivé puisse tricher via l'inspecteur réseau — acceptable pour du microlearning, à documenter. Alternative : endpoint de correction serveur.
- **`cards_seen_count` reconstruit depuis `sort_order`** : la logique `seen = max(seen, pos + 1)` suppose des `sort_order` denses et ordonnés ; après suppression/réordonnancement de cartes d'un pack, le pourcentage peut être faux. Si la précision devient importante, stocker les ids de cartes vues (table dédiée) plutôt qu'un compteur.
- **`DeleteAccountView`** : un compte OAuth (sans mot de passe utilisable) est supprimable sans aucune confirmation. Ajouter une confirmation explicite (retaper le pseudo ou l'email) pour ce cas.
- **Suppression en cascade** : `Deck.delete()` d'un pack officiel (AdminPackDetailView.delete) supprime aussi les `UserDeckProgress` de tous les utilisateurs sans avertissement. Prévoir un statut `archived` comme chemin recommandé et une confirmation forte pour la suppression.
- **Taxonomie `classes` vs `theme`** : `public_views._taxonomy_model` accepte `classes` comme alias de `theme`, mais `content/views._taxonomy_model` (filtres du feed) ne l'accepte pas. Unifier (une seule fonction partagée, avec alias).

---

## Ordre d'exécution suggéré

1. **P1 rapide (une session)** : §1.1, §1.2, §1.4, §1.5, §1.7, §3.4, §3.5 — petits diffs indépendants.
2. **P1 structurant** : §1.6 (throttling), §5.2 (CI) puis §5.1 (tests d'autorisation d'abord).
3. **P2 refactor backend** : §3.1 + §3.2 + §3.3 ensemble (l'éclatement du fichier est le bon moment pour introduire les serializers), puis §2.x (les N+1 se corrigent facilement une fois les querysets centralisés).
4. **P2 contrat API** : §4.1 (OpenAPI + génération de types), puis §4.2/§4.3/§4.4 côté front.
5. **P3** : arbitrages produit de la section 6, §1.3 (README, après stabilisation des routes).
