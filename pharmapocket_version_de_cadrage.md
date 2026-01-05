# App microlearning pharmacologie — document de cadrage (récapitulatif)

## 1) Vision
Créer une **plateforme en ligne de microlearning en pharmacologie**, pensée **mobile-first** (téléphone/tablette/PC) sous forme de **Progressive Web App (PWA)**.

Objectif : permettre un apprentissage par micro-contenus, avec **suivi de progression**, puis ajout progressif de **quiz**, **badges/récompenses** et **contenu généré par les utilisateurs (UGC)**.

---

## 2) Principes produit
### 2.1 Utilisable sans compte
- L’app doit être utilisable **sans inscription**.
- La progression est stockée **localement** (navigateur) pour les utilisateurs anonymes.

### 2.2 Comptes utilisateurs (optionnels)
- Les utilisateurs peuvent créer un compte pour :
  - synchroniser la progression sur plusieurs appareils
  - suivre leur historique
  - participer aux quiz/badges (à terme)
  - contribuer au contenu (UGC) (à terme)

---

## 3) Périmètre fonctionnel
### 3.1 MVP (phase 1)
- PWA responsive (mobile/tablette/desktop)
- Catalogue de contenus (microleçons)
- Affichage d’une microleçon
- Système de tags / catégories (ex. classes thérapeutiques, mécanismes, organes, etc.)
- Suivi de progression **sans compte** (local)
- Comptes utilisateurs (optionnel) + connexion
- Synchronisation de progression pour les comptes
- **Stockage des questions** dès le début (même si l’UI quiz arrive plus tard)

### 3.2 Phase 2 (quiz)
- Moteur de quiz (QCM, vrai/faux, etc.)
- Corrections, explications, références
- Statistiques (taux de réussite, difficultés)

### 3.3 Phase 3 (gamification)
- Badges et récompenses (streaks, milestones, scores…)
- Événements d’apprentissage (event log) pour déclencher des récompenses

### 3.4 Phase 4 (UGC)
- Soumission de contenu par les utilisateurs
- Workflow de modération (brouillon → en revue → publié)
- Historique/versioning, signalements

---

## 4) Choix techniques validés
### 4.1 Frontend
- **Next.js (React) + TypeScript**
- UI : **TailwindCSS + shadcn/ui**
- Données / cache : ex. **TanStack Query**
- Stockage local progression : **IndexedDB** (Dexie ou idb)
- PWA : service worker (Workbox / solution PWA adaptée Next)

> Décision : **pas de WebSockets ni SSE au départ**. Interactions via HTTP + UI optimiste + sync.

### 4.2 Backend
- **Django**
- API : **Django REST Framework (DRF)**
- CMS : **Wagtail** (édition structurée, workflow, modération, multi-langue)

### 4.3 Base de données
- **PostgreSQL** (relationnel + robuste + évolutif)

### 4.4 Tâches asynchrones (plus tard, si besoin)
- **Redis + Celery** (attribution badges, recalcul stats, modération automatique, exports, emails…)

### 4.5 Stockage médias
- Local au début si simple, puis stockage objet type **S3 compatible** (R2/Backblaze/AWS) si images/audio deviennent importants.

---

## 5) Stratégie “sans compte → compte” (fusion)
### 5.1 Mode anonyme
- Un identifiant local est généré et stocké (IndexedDB/localStorage) + progression locale.

### 5.2 Passage à un compte
- Lors de la création/connexion, l’app **propose de fusionner** la progression locale vers le compte.
- Côté back : mécanisme d’import (id local → user) avec résolution de conflits (ex. garder le meilleur score, le plus récent, ou fusion par leçon).

---

## 6) Modélisation de données (à prévoir dès maintenant)
### 6.1 Contenu
- **Lesson / Microleçon** : titre, objectifs, contenu structuré (blocs Wagtail), tags, niveau, temps estimé
- **Tag / Thématique** : hiérarchie possible

### 6.2 Questions (stockage dès le départ)
- **Question** : type, énoncé, choix, bonne(s) réponse(s), explication, difficulté, tags, références
- **Question ↔ Lesson** : lien (une leçon peut avoir plusieurs questions)

### 6.3 Progression
- **Progress** : état par leçon (vue/terminée), progression %, temps cumulé, score (à terme), timestamps

### 6.4 Événements (pour badges + sync)
- **LearningEvent** : lesson_viewed, lesson_progress_updated, lesson_completed, quiz_scored, streak_day, etc.

### 6.5 UGC (plus tard)
- **UserSubmission** : contenu, auteur, statut, historique, signalements

### 6.6 Stockage local (PWA) — modèle minimal recommandé
Objectif : offrir un suivi **sans compte** + préparer une future synchronisation, sans sur-architecture.

#### A) Progression par leçon (champs MVP)
Pour chaque leçon (clé = `lesson_id`) :
- `seen` (bool) : leçon ouverte au moins une fois
- `completed` (bool)
- `percent` (0–100)
- `time_ms` (entier) : temps cumulé passé sur la leçon
- `score_best` (0–100 | null) : meilleur score (quand les quiz arriveront)
- `score_last` (0–100 | null) : dernier score
- `updated_at` (ISO) : dernière mise à jour (utile pour sync/fusion)
- `last_seen_at` (ISO, optionnel)

#### B) Format JSON (lisible) — exemple
- `schema_version` : version du schéma local
- `device_id` : identifiant local
- `locale` : langue active
- `lessons` : dictionnaire `lesson_id -> progress`

#### C) Mesure du temps (simple)
- Démarrer un chrono à l’ouverture de la leçon
- Ajouter le delta au départ (navigation) et lors du passage en arrière-plan
- Appliquer un cap par session (ex. 30 min) pour éviter les onglets laissés ouverts

#### D) Event queue locale (préparation sync)
Ajouter une file d’événements locale (petite et simple) :
- `id` (uuid)
- `type` (ex. lesson_completed)
- `lesson_id`
- `payload` (ex. percent, time_ms_delta, score_last)
- `created_at`
- `synced` (bool)

Usage : l’UI met à jour localement, puis **flush** vers l’API quand l’utilisateur est connecté et que le réseau revient.

#### E) Règles de fusion (anonyme → compte) — version simple
- Conserver l’état le plus récent par `updated_at`
- `time_ms` : additionner ou garder le max (à décider, préférence MVP : addition)
- `score_best` : max(local, serveur)

---

## 7) Rôle de Wagtail (pourquoi on l’utilise)
- Édition ergonomique du contenu
- Contenu **structuré** via blocs (StreamField) : encadrés, résumés, points clés, cas cliniques, tableaux…
- Workflow et permissions (auteur/relecteur/admin)
- Modération adaptée à l’UGC
- Préparation multi-langue

---

## 8) Architecture de communication
- Front (Next.js) consomme une API HTTP (DRF)
- Contenus : exposés via endpoints API (ou rendu via stratégie headless)
- Progression : endpoints dédiés (sync) + stratégie offline-first

---

## 9) Roadmap technique (proposition)
### Étape A — Socle
- Projet Django + Wagtail + Postgres
- Modèles : Lesson, Tag, Question, User/Progress
- Auth (compte optionnel)

### Étape B — Front PWA
- Next.js PWA
- Pages : accueil, catalogue, détail leçon, recherche/tags, profil
- Progression locale + sync compte

### Étape C — Préparer quiz
- UI minimale d’admin pour entrer questions + lier aux leçons
- Validation modèle (difficulté, explication, tags)

### Étape D — Quiz complet, puis gamification, puis UGC

---

## 10) Décisions actées
- PWA (pas d’app native pour l’instant)
- Multi-device responsive
- Sans compte possible
- Comptes pour sync et suivi
- Quiz plus tard, **questions stockées dès maintenant**
- Pas de WebSockets/SSE au départ
- Backend : Django + DRF
- CMS : Wagtail
- DB : PostgreSQL

---

## 11) Points à surveiller (risques courants)
- Synchronisation progression (fusion anonyme → compte) : définir des règles simples dès le départ.
- Qualité du contenu et cohérence : structurer via blocs Wagtail + tags.
- UGC : prévoir modération/workflow et permissions.

---

## 12) Prochaines actions recommandées
1. Définir la **structure type d’une microleçon** (blocs Wagtail)
2. Définir le **modèle Question** (types + champs obligatoires)
3. Définir 5–8 écrans MVP (navigation)
4. Choisir la stratégie exacte de sync (quels champs, quel niveau de détail)



---

## 13) Chemin vers une “vraie app” (stores + offline avancé)
### 13.1 Objectifs
- Être présent sur **Google Play** et **App Store**
- Proposer un **offline avancé** (contenus téléchargeables, progression fiable hors-ligne, synchronisation robuste)

### 13.2 Stratégie recommandée
- **Conserver le backend** (Django/DRF + Wagtail + PostgreSQL) : il est déjà “mobile-ready”.
- **Conserver le front web Next.js** pour l’expérience web/PWA.
- Ajouter une cible “mobile store” via un **wrapper** (priorité iOS) :
  - **Capacitor** (recommandé) : permet d’emballer l’app web dans une WebView, d’ajouter des APIs natives (stockage, notifications, fichiers, etc.) et de publier sur les stores.
  - Alternative Android-only rapide : **TWA** (Trusted Web Activity) pour publier une PWA sur Google Play, utile si tu veux aller vite côté Android.

### 13.3 Offline avancé (approche “local-first”)
Prévoir une couche de persistance et de sync, avec séparation claire entre :
- **Contenu** (leçons, médias)
- **Données utilisateur** (progression, événements, réponses)

Recommandations :
- Introduire une **abstraction de stockage** dès que l’offline devient prioritaire :
  - Web : IndexedDB
  - App : stockage natif + éventuellement **SQLite** pour gros volumes / requêtes
- Mettre en place une **file d’attente d’événements** hors-ligne (event log) :
  - enregistrement local immédiat
  - synchronisation dès que la connexion revient
- Ajouter des **packs offline** :
  - téléchargement de lots de leçons + médias
  - gestion du cache et de la taille (quotas)

### 13.4 Points d’attention
- **iOS** : éviter l’app “simple site emballé” → ajouter de la valeur (offline, téléchargements, navigation app-like, éventuellement notifications) avant soumission.
- **Build** : certaines features SSR sont moins pertinentes en WebView → privilégier une stratégie front compatible “app” (rendu client là où nécessaire).

### 13.5 Roadmap de transition (proposition)
1. PWA solide (déjà le plan)
2. Android : TWA (si besoin rapide) ou direct Capacitor
3. iOS : Capacitor + valeur ajoutée offline
4. Base locale + sync + packs offline

