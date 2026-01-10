# Doc pour l’IA de l’IDE

## Objectif
Mettre en place le système d’utilisateurs pour une application **Django + Wagtail + React (SPA)** en **même domaine**, avec :
- inscription **email/mot de passe**
- connexion/inscription **Google** (extensible à Microsoft/Apple ensuite)
- **auth unifiée** entre l’app React et l’admin Wagtail
- une approche **web-first** : **cookies de session HttpOnly + CSRF** (pas de JWT côté navigateur)

Cette doc sert de **référence de décision + checklist d’implémentation**.

---

## Décision d’architecture (définitive)
### Stack retenue
1. **Custom User Model** Django (dès le début)
2. **django-allauth** pour : email/password, reset password, social accounts (Google)
3. **allauth headless** pour exposer des endpoints compatibles SPA (React)
4. Auth web via **session cookie Django** + **CSRF**
5. Wagtail admin reste sur le flux Django standard (sessions)

### Pourquoi (résumé)
- **Même domaine** ⇒ sessions/cookies très fiables, pas besoin de JWT.
- **Wagtail admin** fonctionne nativement avec les sessions.
- **Cookies HttpOnly** ⇒ meilleure résistance aux vols de tokens via XSS.

---

## Contraintes & périmètre
- React SPA et Django servent sous **le même domaine** (ex: `app.mondomaine.fr`).
- L’admin Wagtail est accessible sur `/admin/`.
- Les endpoints d’auth et l’API applicative seront sous `/auth/` et `/api/`.

---

## Structure recommandée du projet
### Apps
- `users` : custom user model + profile + signaux éventuels
- `content` : contenu Wagtail / modèles
- `api` : endpoints DRF (si nécessaire) pour l’app

### URLs
- `/admin/` : Wagtail admin
- `/auth/` : endpoints allauth headless (login/register/social/…)
- `/api/v1/…` : endpoints métier (DRF ou Django views)

---

## 1) Custom User Model (obligatoire)
### Objectif
Éviter toute dette technique : pouvoir ajouter des champs (ex : infos de profil, photo, préférences) sans douleur.

### Implémentation minimale
Créer `users/models.py` :
- `class User(AbstractUser): pass`
- (optionnel) `Profile` en OneToOne pour préférences app

Mettre dans `settings.py` :
- `AUTH_USER_MODEL = "users.User"`

**Important** : créer le custom user **avant** les premières migrations en prod.

---

## 2) Configuration django-allauth (+ Google)
### Apps à activer
Dans `INSTALLED_APPS` :
- `django.contrib.sites`
- `allauth`, `allauth.account`, `allauth.socialaccount`
- `allauth.socialaccount.providers.google`
- `allauth.headless` (si utilisé)

Dans `settings.py` :
- `SITE_ID = 1`
- `AUTHENTICATION_BACKENDS = (ModelBackend, allauth backend)`

### Paramètres de compte (reco)
- Login par email :
  - `ACCOUNT_EMAIL_REQUIRED = True`
  - `ACCOUNT_USERNAME_REQUIRED = False`
  - `ACCOUNT_AUTHENTICATION_METHOD = "email"`
- Vérification email :
  - `ACCOUNT_EMAIL_VERIFICATION = "mandatory"`

### Google OAuth (résumé)
- Créer un client OAuth dans Google Cloud.
- Déclarer les redirect URIs (celles attendues par allauth/headless selon le flux).
- Renseigner `SOCIALACCOUNT_PROVIDERS["google"]` si besoin (scopes, etc.).

---

## 3) Auth SPA React (même domaine) : cookies session + CSRF
### Principe
- Le backend délivre un **cookie de session HttpOnly**.
- React inclut automatiquement le cookie en requêtes same-site.
- Les requêtes mutantes envoient un **token CSRF**.

### Côté React
- Utiliser `fetch`/`axios` avec :
  - `credentials: "include"`
- Lire le token CSRF depuis le cookie non-HttpOnly (ex: `csrftoken`) ou endpoint dédié.
- Ajouter l’en-tête `X-CSRFToken` sur POST/PUT/PATCH/DELETE.

### Côté Django
- Activer middleware CSRF.
- S’assurer que les settings `CSRF_COOKIE_SAMESITE`, `SESSION_COOKIE_SAMESITE` conviennent (souvent `Lax`).
- En HTTPS : `CSRF_COOKIE_SECURE = True`, `SESSION_COOKIE_SECURE = True`.

---

## 4) allauth headless : endpoints auth pour SPA
### Objectif
Exposer :
- register
- login/logout
- password reset
- social login (Google)

### Recommandation
- Utiliser allauth headless pour les endpoints “auth” SPA.
- Garder l’admin Wagtail sur la session Django classique.

---

## 5) Permissions Wagtail (séparation des rôles)
### Règles
- Utilisateurs de l’app : `is_staff=False`
- Éditeurs Wagtail : `is_staff=True` + groupes/permissions Wagtail

### Attributions
- Par défaut, **ne jamais** donner de droits Wagtail aux utilisateurs Google.
- Si besoin : assigner automatiquement un groupe Wagtail **uniquement** via règle (whitelist emails/domaine, validation manuelle, feature flag).

---

## 6) Flux de connexion recommandés
### Email/password
1. React appelle `/auth/register/`
2. Email de vérification (si mandatory)
3. Login via `/auth/login/` ⇒ cookie de session

### Google
Option A (souvent la plus simple côté web) : flux allauth/headless (redirect managed)
1. React déclenche le flow social via endpoint headless
2. Callback serveur
3. Session créée ⇒ cookie

Option B (token exchange)
1. React obtient un token Google (lib Google)
2. React l’envoie au backend
3. Backend vérifie auprès de Google, crée/lie l’utilisateur, ouvre une session

---

## 7) Points de vigilance (anti-pièges)
- **Ne pas stocker de token en localStorage**.
- Bien distinguer les routes et redirect :
  - `/admin/login/` doit rester pour l’admin
  - `/auth/*` pour la SPA
- Surveiller la cohérence `SITE_ID` et domaines.
- En prod : forcer HTTPS + cookies secure.

---

## 8) “Definition of Done” (checklist)
- [ ] `AUTH_USER_MODEL` en place + migrations OK
- [ ] allauth installé/configuré + provider Google prêt
- [ ] endpoints headless accessibles sous `/auth/`
- [ ] login SPA crée bien une session (cookie HttpOnly)
- [ ] CSRF OK sur requêtes mutantes depuis React
- [ ] Wagtail admin accessible, login admin OK
- [ ] rôles : users app ≠ staff Wagtail

---

## 9) Évolutions futures
Passer à JWT (dj-rest-auth + SimpleJWT) uniquement si :
- app mobile native
- multiples clients/domaine différents
- API publique

Sinon, conserver sessions/cookies.

