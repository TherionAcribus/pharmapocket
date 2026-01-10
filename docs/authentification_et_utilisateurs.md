# Authentification & gestion des utilisateurs (PharmaPocket)

## Objectif
Mettre en place une authentification **web-first** pour une application **Django + Wagtail + Frontend (Next.js/React)**.

- Auth **unifiée** entre l’app (frontend) et l’admin Wagtail.
- Auth navigateur via **cookies de session HttpOnly** + **CSRF**.
- Pas de JWT côté navigateur, pas de stockage de token en `localStorage`.
- Support : **email/mot de passe** (inscription + connexion) + (prévu) **Google OAuth**.

---

## Architecture (vue d’ensemble)

### Pourquoi sessions + CSRF ?
- **Même domaine** (ou dev en CORS contrôlé) : les cookies de session sont fiables.
- Cookie de session **HttpOnly** : non accessible depuis JS (réduit l’impact d’un XSS).
- **CSRF** protège les requêtes mutantes (POST/PUT/PATCH/DELETE) contre les attaques cross-site.

### Composants
- **Django/Wagtail**
  - Custom user model (`users.User`).
  - `django-allauth` : logique de comptes (signup/login/email verification, providers).
  - `allauth.headless` : endpoints API compatibles SPA.
  - DRF : endpoints applicatifs + helper endpoints (`/api/v1/auth/csrf/`, `/api/v1/auth/me/`).
- **Frontend (Next.js/React)**
  - Client `fetch` centralisé (`frontend/src/lib/api.ts`) :
    - `credentials: "include"`
    - ajout automatique de `X-CSRFToken` sur les requêtes mutantes
  - Pages : `/account/login`, `/account/signup`, `/account/verify-email/[key]`.

---

## Backend (Django) : configuration et conventions

### Apps installées
Dans `backend/pharmapocket/settings.py`, on utilise notamment :
- `users.apps.UsersConfig`
- `allauth`
- `allauth.account`
- `allauth.socialaccount`
- `allauth.socialaccount.providers.google`
- `allauth.headless`

### Modèle utilisateur
- App : `backend/users/`
- Modèle : `backend/users/models.py`
  - `class User(AbstractUser): pass`
- Setting :
  - `AUTH_USER_MODEL = "users.User"`

### Middlewares requis
- `django.contrib.sessions.middleware.SessionMiddleware`
- `django.middleware.csrf.CsrfViewMiddleware`
- `django.contrib.auth.middleware.AuthenticationMiddleware`
- `allauth.account.middleware.AccountMiddleware` (requis par allauth)

### allauth : paramètres principaux
- Backends :
  - `django.contrib.auth.backends.ModelBackend`
  - `allauth.account.auth_backends.AuthenticationBackend`

- Login/signup par email :
  - `ACCOUNT_LOGIN_METHODS = {"email"}`
  - `ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]`

- Vérification email :
  - `ACCOUNT_EMAIL_VERIFICATION = "mandatory"`

**Conséquence importante** :
- un utilisateur nouvellement créé / non vérifié ne pourra pas forcément être authentifié tout de suite.
- les endpoints headless peuvent renvoyer **401** alors que l’email a bien été envoyé (l’utilisateur n’est pas authentifié).

### allauth.headless : routes
Dans `backend/pharmapocket/urls.py` :
- `path("accounts/", include("allauth.urls"))` (utile pour certains flows web/OAuth)
- `path("auth/", include("allauth.headless.urls"))`

Les endpoints headless utilisés côté frontend (client `browser`) :
- `POST /auth/browser/v1/auth/login`
- `POST /auth/browser/v1/auth/signup`
- `DELETE /auth/browser/v1/auth/session` (logout)
- `POST /auth/browser/v1/auth/email/verify` (payload `{ "key": "..." }`)

### Endpoints SPA helper (DRF)
Implémentés dans `backend/pharmapocket/auth_views.py` et exposés dans `backend/pharmapocket/v1_urls.py` :

- **CSRF cookie bootstrap**
  - `GET /api/v1/auth/csrf/`
  - pose le cookie `csrftoken` (via `ensure_csrf_cookie`)

- **Utilisateur courant**
  - `GET /api/v1/auth/me/`
  - nécessite une session authentifiée
  - renvoie : `id`, `email`, `username`, `is_staff`, `is_superuser`

### CORS / cookies (mode dev)
Si le frontend tourne sur `http://localhost:3000` et le backend sur `http://127.0.0.1:8000`, on doit autoriser les cookies cross-origin.

Dans `settings.py` :
- `CORS_ALLOWED_ORIGINS` inclut `http://localhost:3000`
- `CORS_ALLOW_CREDENTIALS = True`
- `CORS_ALLOW_HEADERS` inclut `x-csrftoken`
- `CSRF_TRUSTED_ORIGINS` inclut `http://localhost:3000`

### Email (mode dev)
Avec `ACCOUNT_EMAIL_VERIFICATION = "mandatory"`, allauth envoie des emails.

En dev, on utilise un backend email console :
- `EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"` si `DEBUG`.

Les emails apparaissent dans la sortie du `runserver`.

---

## Frontend (Next.js/React) : intégration

### Client API central (`frontend/src/lib/api.ts`)
Invariants :
- **Toujours** envoyer `credentials: "include"` (session cookie).
- Sur `POST/PUT/PATCH/DELETE` :
  - s’assurer que le cookie `csrftoken` existe via `GET /api/v1/auth/csrf/`
  - envoyer l’en-tête `X-CSRFToken: <csrftoken>`

Helpers exposés :
- `authLogin({ email, password })`
- `authSignup({ email, password })`
- `authVerifyEmail(key)`
- `authLogout()`
- `fetchMe()`

### Pages & parcours utilisateur
- `GET /account/login` : formulaire de connexion
- `GET /account/signup` : formulaire d’inscription
- `GET /account/verify-email/[key]` : consomme le lien email et appelle `authVerifyEmail(key)`
- Drawer : section Compte (connexion/inscription si déconnecté, email + préférences + déconnexion si connecté)

---

## Flows détaillés

### 1) Connexion (email + mot de passe)
1. Frontend appelle :
   - `POST /auth/browser/v1/auth/login` avec `{ email, password }`
2. Si l’utilisateur est valide et l’email vérifié :
   - le backend crée une session, renvoie `200`
3. Frontend vérifie l’état :
   - `GET /api/v1/auth/me/` ⇒ `200` + données user

Cas fréquent :
- si `ACCOUNT_EMAIL_VERIFICATION = "mandatory"` et email non vérifié :
  - allauth peut **envoyer un email** puis renvoyer `401`.

### 2) Inscription
1. Frontend appelle :
   - `POST /auth/browser/v1/auth/signup` avec `{ email, password }`
2. allauth envoie l’email de vérification
3. L’utilisateur clique le lien :
   - `http://localhost:3000/account/verify-email/<key>`
4. Frontend appelle :
   - `POST /auth/browser/v1/auth/email/verify` avec `{ key }`
5. Ensuite seulement :
   - l’utilisateur peut se connecter via `/account/login`

### 3) Déconnexion
1. Frontend appelle :
   - `DELETE /auth/browser/v1/auth/session`
2. La session est supprimée
3. `GET /api/v1/auth/me/` renvoie ensuite `403`/`401` (non authentifié)

---

## Gestion des rôles (Wagtail vs app)

Règle recommandée :
- **Utilisateurs de l’app** : `is_staff = False`
- **Éditeurs/admin Wagtail** : `is_staff = True` + groupes/permissions Wagtail

Ne jamais accorder automatiquement des droits Wagtail à un utilisateur social (Google) sans règle stricte (whitelist, validation manuelle).

---

## Dépannage (FAQ)

### `ConnectionRefusedError` sur SMTP
Cause : allauth tente d’envoyer un email via SMTP (par défaut `localhost:25`).

Fix : en dev, utiliser `EMAIL_BACKEND = django.core.mail.backends.console.EmailBackend`.

### `401 Unauthorized` sur `/auth/.../signup` ou `/auth/.../email/verify`
Avec `ACCOUNT_EMAIL_VERIFICATION = "mandatory"`, ces endpoints peuvent renvoyer `401` si l’utilisateur n’est pas authentifié.

Important :
- ce `401` ne signifie pas forcément que “rien ne s’est passé” :
  - l’email peut avoir été envoyé
  - l’action peut nécessiter un autre step (cliquer le lien de vérification)

### `403 Forbidden` sur `/api/v1/auth/me/`
Normal : endpoint protégé (`IsAuthenticated`).
- `200` si session authentifiée
- `403` si non connecté (ou cookie session non envoyé)

### Cookies non envoyés / session non persistante
Checklist :
- Frontend : requêtes avec `credentials: "include"`
- Backend : `CORS_ALLOW_CREDENTIALS = True`
- Origines : `CORS_ALLOWED_ORIGINS` et `CSRF_TRUSTED_ORIGINS` corrects
- Attention en dev : `localhost` vs `127.0.0.1` peut casser les cookies

---

## Sécurité (prod)
- HTTPS obligatoire
  - `SESSION_COOKIE_SECURE = True`
  - `CSRF_COOKIE_SECURE = True`
- Considérer :
  - `SESSION_COOKIE_SAMESITE = "Lax"` (souvent OK)
  - `CSRF_COOKIE_SAMESITE = "Lax"`
- Ne jamais exposer de secrets côté frontend.

---

## Évolutions prévues (Google)
`django-allauth` + `allauth.headless` permettent :
- listing providers : `GET /auth/browser/v1/account/providers`
- redirect/provider flows (`/auth/browser/v1/auth/provider/...`)

### Pré-requis Google (Google Cloud)
Dans Google Cloud Console :
- Créer/configurer l'"OAuth consent screen".
- Créer un **OAuth Client ID** de type **Web application**.

Configurer (en dev) :
- **Authorized JavaScript origins**
  - `http://localhost:3000`
- **Authorized redirect URIs**
  - `http://localhost:8000/accounts/google/login/callback/`

Important :
- `localhost` et `127.0.0.1` sont considérés comme **différents** par Google.
- Pour éviter des problèmes de cookies/CSRF, il est recommandé d'utiliser une seule forme partout.
  - Reco dev : lancer Django sur `http://localhost:8000`.

### Pré-requis Django (SocialApp)
Dans l'admin Django (route `django-admin/`) :
- `Sites` : vérifier que le site courant correspond au domaine utilisé en dev.
- `Social applications` : créer une app Google et la lier au site.
  - Provider: `Google`
  - Client id / Secret: ceux de Google Cloud

### Flow utilisé côté frontend (redirect)
On utilise le flow "redirect" fourni par `allauth.headless` :

1. L'utilisateur clique "Continuer avec Google".
2. Le frontend envoie un **POST form** vers :
   - `POST /auth/browser/v1/auth/provider/redirect`
   - champs :
     - `provider=google`
     - `process=login`
     - `callback_url=http://localhost:3000/account/oauth-callback?next=/discover`
3. Django redirige vers Google, puis Google redirige vers :
   - `http://localhost:8000/accounts/google/login/callback/`
4. allauth finalise le login (création/association utilisateur) et établit la session.
5. allauth redirige vers `callback_url` (frontend) où l'on vérifie la session via :
   - `GET /api/v1/auth/me/`

Notes :
- Ce flow crée une **session cookie Django** (comme pour email/password).
- En cas de restrictions sur la création de compte, allauth peut demander un step additionnel (endpoint `.../auth/provider/signup`).

Pour activer Google :
- configurer le provider dans `INSTALLED_APPS`
- renseigner les credentials via l’admin Django (SocialApp) ou via settings/env
- définir les redirect URIs attendues

---

## Références code (dans ce repo)
- Backend
  - `backend/pharmapocket/settings.py`
  - `backend/pharmapocket/urls.py`
  - `backend/pharmapocket/v1_urls.py`
  - `backend/pharmapocket/auth_views.py`
  - `backend/users/models.py`
- Frontend
  - `frontend/src/lib/api.ts`
  - `frontend/src/components/MobileScaffold.tsx`
  - `frontend/src/app/account/login/page.tsx`
  - `frontend/src/app/account/signup/page.tsx`
  - `frontend/src/app/account/verify-email/[key]/page.tsx`
  - `frontend/src/app/account/preferences/page.tsx`
