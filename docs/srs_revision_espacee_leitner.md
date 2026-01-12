# SRS (révision espacée) – doc technique

## Objectif
Mettre en place un système de **révision espacée (SRS)** pour les cartes (micro-articles), avec un MVP basé sur **Leitner**.

Contraintes produit/tech :
- Simple et maintenable.
- Algorithme facilement remplaçable (ex : SM-2 type Anki) sans refondre tout le backend.
- Fonctionne par utilisateur.
- Permet de réviser :
  - un deck,
  - plusieurs decks,
  - tous les decks,
  - toutes les cartes de l’app.

---

## Vue d’ensemble de l’architecture

### Backend
Le backend implémente :
- Un **modèle de persistance** pour stocker l’état SRS d’une carte pour un utilisateur.
- Une **couche d’algorithme** (module Python) responsable de calculer le prochain état après une revue.
- Deux endpoints DRF :
  - `srs/next` : choisir la prochaine carte à présenter,
  - `srs/review` : soumettre la note de l’utilisateur et mettre à jour l’état.

### Frontend
Le frontend consomme l’API via :
- `fetchSrsNext()` pour obtenir la carte suivante.
- `postSrsReview()` pour soumettre la note (know/medium/again).

---

## Modèle de données

### `learning.models.CardSRSState`
**Rôle** : stocker l’état SRS d’une carte **par utilisateur**.

Champs (principaux) :
- `user` : FK vers `AUTH_USER_MODEL`.
- `microarticle` : FK vers `content.models.MicroArticlePage`.
- `srs_level` : entier 1..5 (niveau Leitner).
- `due_at` : date/heure à laquelle la carte redevient « due ».
- `last_reviewed_at` : dernière date de revue (nullable).
- `reviews_count` : nombre de revues effectuées.
- `last_rating` : dernière note (`know|medium|again`).
- `created_at`, `updated_at` : timestamps.

Contraintes & indexes :
- **Unicité** : `(user, microarticle)`.
- Indexes :
  - `(user, due_at)` pour requêter rapidement les cartes dues d’un utilisateur.
  - `(microarticle)`.

Migration : `backend/learning/migrations/0002_cardsrsstate.py`.

---

## Notion de « carte due »

Une carte est considérée **due** si :
- elle a un `CardSRSState` et `due_at <= now`.

Cas important (MVP) : **carte jamais vue**
- Une carte **sans** `CardSRSState` est considérée **due immédiatement**.
- Elle est traitée comme si elle était au niveau **1**.

Cela permet de démarrer une session SRS sans pré-initialisation.

---

## API (backend)

### 1) Récupérer la prochaine carte

Endpoint :
- `GET /api/v1/learning/srs/next/`

Paramètres :
- `scope` (obligatoire) :
  - `deck` : révision sur un deck donné
  - `decks` : révision sur une liste de decks
  - `all_decks` : tous les decks de l’utilisateur
  - `all_cards` : toutes les cartes de l’app (MVP)
- `deck_id` : requis si `scope=deck`.
- `deck_ids` : CSV d’ids requis si `scope=decks`.
- `only_due` :
  - `true` (défaut) : ne renvoyer que des cartes dues (ou jamais vues)
  - `false` : autoriser aussi des cartes non dues (utile pour « faire du volume »)

Réponse (shape) :
- `card`: objet carte ou `null` si rien à proposer.
- `srs`: état SRS correspondant ou `null`.

Comportement :
- Si `only_due=true` et qu’il n’existe aucune carte due : `card=null`.
- Les cartes jamais vues (pas de `CardSRSState`) sont proposées comme **niveau 1**.

Implémentation : `backend/learning/views.py` (`SRSNextView`).

### 2) Soumettre une revue

Endpoint :
- `POST /api/v1/learning/srs/review/`

Payload JSON :
- `card_id` : id de `MicroArticlePage`
- `rating` :
  - `know`
  - `medium`
  - `again`

Réponse :
- même shape que `srs/next` (retourne la carte revue + état mis à jour).

Implémentation : `backend/learning/views.py` (`SRSReviewView`).

---

## Algorithme Leitner (MVP)

### Principes
Leitner utilise des « boîtes » (niveaux) :
- Niveau 1 → très fréquent
- Niveau 5 → espacé

Le principe MVP :
- Une carte a un `level` (1..5)
- Après une revue, on calcule un `next_level` selon la note
- On calcule une prochaine date `due_at = now + interval(next_level)`

### Intervalles
Dans ce repo (MVP), les intervalles sont **fixes** par niveau :
- L1 : 1 jour
- L2 : 3 jours
- L3 : 7 jours
- L4 : 14 jours
- L5 : 30 jours

Référence code : `backend/learning/srs.py` (`LEITNER_INTERVAL_DAYS_BY_LEVEL`).

### Règles de transition
Notes (rating) :
- `know` : la carte monte d’un niveau (+1), max 5
- `medium` : la carte reste au même niveau
- `again` : la carte descend d’un niveau (-1), min 1

### Fonction de calcul
Fichier : `backend/learning/srs.py`
- `next_leitner_state(level, rating, now=None) -> SRSUpdate`
- Retourne :
  - `level` : niveau suivant
  - `due_at` : prochaine échéance

Détails :
- Le niveau courant est clampé dans `[1,5]` avant calcul.
- Le `due_at` est calculé à partir de `timezone.now()` si `now` n’est pas fourni.

---

## Exemples

### Exemple A – carte jamais vue
1. La carte n’a pas de `CardSRSState`.
2. `srs/next` peut la renvoyer comme :
   - `level = 1`
   - `due_at = now`
3. L’utilisateur note `know`.
4. Nouveau state :
   - `level = 2`
   - `due_at = now + 3 jours`

### Exemple B – carte L3 due, note « again »
- Niveau courant : 3
- Note : `again`
- Niveau suivant : 2
- Prochaine échéance : `now + 3 jours`

### Exemple C – carte L5, note « know »
- Niveau courant : 5
- Note : `know`
- Niveau suivant : 5 (cap)
- Prochaine échéance : `now + 30 jours`

---

## Points d’attention / décisions MVP

- **Pas de files de session** côté backend : le backend renvoie « une prochaine carte » selon l’état courant.
- **Sélection de la prochaine carte** : MVP pragmatique (objectif : livrer un flux fonctionnel).
- **Unseen cards = due** : facilite le démarrage et évite une phase d’initialisation.

---

## Évolutions prévues

### Remplacer Leitner par SM-2 (type Anki)
Le design permet de changer l’algo en conservant :
- `CardSRSState` (éventuellement avec nouveaux champs)
- les endpoints (mêmes routes)

Approche recommandée :
- créer un nouveau module `learning/srs_sm2.py` (ou refactorer en stratégie),
- faire pointer `SRSReviewView` vers la nouvelle fonction de calcul,
- migrer le modèle si nécessaire (ex: ease factor, interval, etc.).

---

## Références (dans ce repo)

- Backend
  - `backend/learning/models.py` (CardSRSState)
  - `backend/learning/srs.py` (Leitner)
  - `backend/learning/views.py` (`SRSNextView`, `SRSReviewView`)
  - `backend/learning/serializers.py`
  - `backend/learning/urls.py`

- Frontend
  - `frontend/src/lib/api.ts` (`fetchSrsNext`, `postSrsReview`)
  - `frontend/src/app/review/page.tsx`
  - `frontend/src/lib/types.ts`
