# Spécification – Decks de cartes sauvegardées

## 1) Objectif produit

### Problème
Aujourd’hui, l’utilisateur peut “sauvegarder” une carte, mais tout va dans une seule liste (“Mes cartes”). Certains utilisateurs veulent organiser leurs cartes en **plusieurs collections** (ex: “Diabète”, “À revoir”, “Exam”, “Cardio”).

### Objectif
Permettre à un utilisateur de créer et gérer plusieurs **Decks** (collections) de cartes sauvegardées.

### Principes UX
- **Simplicité conservée** : un clic = ajout au **deck par défaut**.
- **Puissance optionnelle** : appui long / clic droit = ajout dans **un autre deck** (et multi-decks).
- **Une carte peut être dans plusieurs decks**.

### Non-objectifs (pour cette itération)
- Decks intelligents (règles auto)
- Partage public / export
- SRS / algorithme de révision par deck

---

## 2) Terminologie
- **Carte** : unité de microlearning (existante).
- **Deck** : collection personnalisée de cartes pour un utilisateur.
- **Deck par défaut** : deck implicite “Mes cartes” utilisé par l’action rapide.

---

## 3) User stories
1. **Sauvegarde rapide** : cliquer sur “Sauvegarder” ajoute la carte au deck par défaut.
2. **Organisation avancée** : appui long / clic droit ouvre un sélecteur de decks.
3. **Multi-decks** : une carte peut être dans plusieurs decks.
4. **Gestion des decks** : créer / renommer / supprimer / définir par défaut.
5. **Deck view** : ouvrir un deck et gérer ses cartes.

---

## 4) UX / UI – comportements attendus

### 4.1 Sur une carte (bibliothèque / feed)

#### Action principale (MVP)
- **Tap / clic sur l’icône “Sauvegarder”**
  - Si la carte n’est pas dans le deck par défaut → **ajouter**.
  - Si elle y est déjà → **retirer**.

**Feedback**
- Snackbar/Toast : “Ajouté à ‘Mes cartes’” / “Retiré de ‘Mes cartes’”
- Action **Annuler** (Undo) recommandée.

#### Action avancée
- **Appui long (mobile)** ou **clic droit (desktop)** sur “Sauvegarder” ouvre “Ajouter à un deck…”
  - Liste des decks avec checkboxes (coché si déjà présent)
  - CTA “+ Créer un deck”
  - (Optionnel) “Définir comme deck par défaut”

**Interaction**
- Taper un deck toggle on/off (ajoute/retire l’appartenance).
- À la fermeture : snackbar “Mis à jour : Diabète, Exam”.

#### Accessibilité / fallback
- Ajouter une icône “…” (kebab) ouvrant le même panneau si long press / right-click non accessible.

---

### 4.2 Écran “Mes cartes” (gestion)

#### Structure
- Section **Decks**
  - Deck par défaut en premier, label “Par défaut”.
  - Liste des decks avec compteur de cartes.
  - Bouton **Créer un deck**.

#### Gestion d’un deck
- Ouvrir un deck → liste des cartes (recherche + pagination).
- Actions deck : **Renommer**, **Définir par défaut**, **Supprimer**.
- Actions sur cartes : **Retirer du deck** (n’affecte pas les autres decks).

#### Règles UX
- Le deck par défaut **ne peut pas être supprimé**.
- Supprimer un deck **ne supprime pas les cartes** globales, seulement les liens deck↔carte.

---

## 5) Modèle de données (DB)

### 5.1 Tables / Entités

#### `deck`
- `id` (UUID ou int)
- `user_id` (FK utilisateur)
- `name` (string, max 60)
- `is_default` (bool)
- `sort_order` (int)
- `created_at`, `updated_at`

**Contraintes**
- Unique `(user_id, name)` (idéalement case-insensitive)
- Un seul deck `is_default=true` par user (contrainte DB partielle ou logique applicative)

#### `deck_card` (liaison)
- `deck_id` (FK deck)
- `card_id` (FK carte)
- `added_at`

**Contraintes**
- Unique `(deck_id, card_id)`
- Index sur `deck_id` et `card_id`

### 5.2 Suppression
- Si une carte est supprimée du contenu : cascade delete des liens `deck_card` (simplifie).

---

## 6) API (REST) – Contrat

> Hypothèse : backend Django + DRF (ou équivalent), auth existante.

### 6.1 Decks

#### GET `/api/v1/decks`
Retourne les decks de l’utilisateur (triés par `sort_order`).

```json
[
  {"id":"d1","name":"Mes cartes","is_default":true,"sort_order":0,"cards_count":42},
  {"id":"d2","name":"Diabète","is_default":false,"sort_order":1,"cards_count":12}
]
```

#### POST `/api/v1/decks`
Créer un deck.

```json
{"name":"Cardio"}
```

#### PATCH `/api/v1/decks/{deck_id}`
Renommer / modifier ordre.

```json
{"name":"Diabète T2"}
```

#### POST `/api/v1/decks/{deck_id}/set-default`
Définir ce deck comme deck par défaut.

```json
{"ok":true,"default_deck_id":"d2"}
```

#### DELETE `/api/v1/decks/{deck_id}`
Supprimer un deck (interdit si `is_default=true`).

---

### 6.2 Gestion des cartes dans un deck

#### GET `/api/v1/decks/{deck_id}/cards?search=&page=`
Liste paginée des cartes du deck.

```json
{
  "count": 12,
  "results": [
    {"card_id":"c10","title":"Comment fonctionne la metformine ?","slug":"metformine"}
  ]
}
```

#### POST `/api/v1/decks/{deck_id}/cards`
Ajouter une carte au deck (idempotent recommandé).

```json
{"card_id":"c10"}
```

#### DELETE `/api/v1/decks/{deck_id}/cards/{card_id}`
Retirer une carte du deck (idempotent).

---

### 6.3 Toggle rapide (deck par défaut)

#### POST `/api/v1/cards/{card_id}/toggle-save`
Toggles l’appartenance au deck par défaut.

```json
{"card_id":"c10","in_default_deck":true,"default_deck_id":"d1"}
```

---

### 6.4 Sélecteur multi-decks

#### GET `/api/v1/cards/{card_id}/decks`
Retourne decks + membership.

```json
[
  {"id":"d1","name":"Mes cartes","is_default":true,"is_member":true},
  {"id":"d2","name":"Diabète","is_default":false,"is_member":false}
]
```

#### PUT `/api/v1/cards/{card_id}/decks` (optionnel mais pratique)
Remplace l’ensemble des decks de la carte.

```json
{"deck_ids":["d1","d2"]}
```

---

## 7) Logique métier (backend)

### 7.1 Création du deck par défaut
- À la création du compte (ou 1er accès à “Mes cartes”) : créer “Mes cartes” `is_default=true`.
- Garantir qu’un user a toujours un deck par défaut.

### 7.2 Permissions
- Un user ne peut lire/modifier que **ses** decks.
- Toute opération deck↔carte vérifie `deck.user_id == request.user.id`.

### 7.3 Idempotence (recommandé)
- Ajouter une carte déjà présente → OK sans erreur.
- Retirer une carte absente → 204 quand même.

---

## 8) Migration depuis le système actuel

### Plan
1. Ajouter `deck` et `deck_card`.
2. Pour chaque user existant :
   - Créer deck par défaut si absent.
   - Copier les anciennes cartes sauvegardées dans le deck par défaut.
3. Déprécier l’ancien système si nécessaire.

---

## 9) Frontend – composants et état

### 9.1 Composants
- `SaveButton` : click → toggle défaut ; long press/right click → `DeckPickerModal`.
- `DeckPickerModal` : charge membership + toggles + création deck.
- `MyCardsPage` : liste decks, création, vue deck.

### 9.2 États UI
- Cache decks (React Query / SWR).
- Optimistic UI sur toggles + rollback si erreur.
- Snackbars standardisés.

---

## 10) Critères d’acceptation
- Un user peut CRUD decks (sauf supprimer default).
- Un seul deck par défaut par user.
- Clic = toggle dans deck par défaut + feedback.
- Long press/clic droit (ou kebab) = multi-decks.
- Une carte peut être dans plusieurs decks.
- Supprimer un deck retire seulement les liens.
- Sécurité OK.
- Migration OK.

---

## 11) Tests recommandés

### Backend
- Constraints : unique (deck_id, card_id), 1 default deck.
- API : CRUD decks + permissions + toggle + multi-decks.

### Frontend (e2e)
- Toggle rapide + undo.
- Multi-decks via long press ou kebab.
- Ajout à 2 decks puis retrait d’un seul.

