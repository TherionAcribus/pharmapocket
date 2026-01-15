# Decks officiels vs Decks utilisateurs

Objectif : ajouter des **Decks éditoriaux (officiels)**, créés et maintenus par l’application, **sans casser** le système existant de **Decks utilisateurs** (organisation personnelle). Une carte peut appartenir à plusieurs decks, dans les deux systèmes.

---

## 1) Concepts

### Decks utilisateurs (existant)
- But : **organiser / sauvegarder** ses cartes.
- Un **Deck par défaut** existe pour ceux qui ne veulent pas gérer.
- Un utilisateur peut créer plusieurs decks.
- Une carte peut appartenir à **0..n** decks utilisateur.

### Decks officiels (nouveau)
- But : **réviser / apprendre via une sélection thématique** (curation + ordre recommandé optionnel, sans promesse de formation complète).
- Créés par l’équipe (admin) et **non éditables** par l’utilisateur.
- Une carte peut appartenir à **0..n** decks officiels.

### UX : ne pas mélanger
- Dans l’interface, distinguer clairement :
  - **Packs** (decks officiels)
  - **Mes decks** (deck utilisateurs)

> Recommandation : garder le mot *Deck* en base si tu veux, mais afficher *Parcours* côté UI pour les officiels.

---

## 2) Modèle de données (conceptuel)

### Table `deck`
- `id`
- `title`
- `description` (courte, orientée objectif)
- `type` : `user` | `official`  *(ou `is_system` bool)*
- `owner_user_id` : nullable
  - `type=user` => owner_user_id = user
  - `type=official` => owner_user_id = NULL
- `is_default` : bool (uniquement pertinent pour `type=user`)
- `difficulty` (optionnel) : `beginner` | `intermediate` | `advanced`
- `estimated_minutes` (optionnel)
- `status` : `draft` | `published` | `archived` (recommandé pour les officiels)
- `created_at`, `updated_at`

### Table de liaison `deck_card`
Many-to-many entre `deck` et `card`
- `deck_id`
- `card_id`
- `position` : int nullable (pour ordre recommandé, surtout pour les officiels)
- `is_optional` : bool (cartes bonus / approfondissement)
- `notes` : text nullable (note éditoriale spécifique au deck, 1–2 lignes max)
- Index : (`deck_id`, `position`), (`deck_id`, `card_id` unique)

### Progression utilisateur sur un deck officiel
`user_deck_progress`
- `user_id`
- `deck_id` (uniquement `type=official`)
- `started_at`
- `last_seen_at`
- `progress_pct` (ou `cards_seen_count` / `cards_done_count`)
- `mode_last` : `ordered` | `shuffle` | `due_only`
- `last_card_id` (optionnel)

> Note : l’état d’apprentissage (spaced repetition / score) reste **par carte** (global), et le deck n’est qu’un contexte + progression.

---

## 3) Règles fonctionnelles

### Consultation
- Un deck officiel est visible si `status=published`.
- Les decks officiels sont **en lecture seule** pour l’utilisateur.

### Sauvegarde des cartes (déjà existant)
- Depuis n’importe où, action "Enregistrer" ajoute la carte au **deck par défaut**.
- Action longue / menu => "Ajouter à un autre deck…" (liste des decks utilisateur).

### Depuis un deck officiel
L’utilisateur peut :
1. **Lancer une session** sur ce parcours (sans copier les cartes)
2. **Enregistrer une carte** dans ses decks utilisateurs (déjà)
3. (Optionnel) **Importer le parcours** dans ses decks

### Import (optionnel mais utile)
- Action : "Importer dans mes decks"
- Crée un deck utilisateur : `title = <Titre deck officiel> (import)`
- Copie toutes les liaisons `deck_card` (sans casser les officielles)
- L’utilisateur peut ensuite modifier son deck importé.

---

## 4) UX / UI

### Navigation
- Onglet / page : **Packs** (officiels)
- Onglet / page : **Mes decks** (utilisateurs)

### Liste des packs (decks officiels)
Chaque carte de parcours affiche :
- Titre
- Description (1 phrase)
- Nombre de cartes
- Niveau (optionnel)
- Durée estimée (optionnel)
- Progression utilisateur (barre / % / "Reprendre")

### Détail d’un pack
- Bouton principal : **Commencer / Reprendre**
- Boutons secondaires :
  - "Réviser aléatoirement"
  - "À revoir" (si système de cartes "due")
  - "Importer dans mes decks" (si activé)

### Affichage d’une carte dans un pack
- CTA "Enregistrer" => deck par défaut
- CTA "Ajouter à un deck…" => choix deck utilisateur
- Indicateur discret : "Fait partie du parcours <X>" (optionnel)

---

## 5) API (proposition)

### Officiels
- `GET /api/decks?type=official` => liste (filtrable par catégorie/tag si utile)
- `GET /api/decks/{id}` => détail + cartes (ordre position si présent)
- `POST /api/decks/{id}/start` => init progress (idempotent)
- `POST /api/decks/{id}/progress` => update (last_seen, last_card, counts)
- `POST /api/decks/{id}/import` (optionnel) => crée deck user + copie liaisons

### Utilisateurs (existant)
- inchangé, mais filtrer par `type=user` par défaut

---

## 6) Admin / CMS (édition)

Minimum viable :
- CRUD deck officiel (title, description, status)
- Gestion des cartes dans le deck :
  - ajout/retrait
  - tri (drag & drop => `position`)
  - marquer "optionnelle"

Recommandation :
- Duplication de deck officiel (pour faire des versions)
- Archiver plutôt que supprimer (stabilité des URLs / références)

---

## 7) Migration / rétrocompatibilité

- Les decks actuels deviennent `type=user`.
- Le deck par défaut utilisateur reste inchangé.
- Aucune modification de comportement nécessaire pour "Enregistrer".

---

## 8) Checklist MVP

- [ ] Champ `type` (ou `is_system`) sur `deck`
- [ ] `owner_user_id` nullable (ou convention "system")
- [ ] Espace UI "Parcours" séparé de "Mes decks"
- [ ] Lecture d’un parcours + session "Commencer/Reprendre"
- [ ] Progression `user_deck_progress`
- [ ] Admin: créer un parcours, y ajouter des cartes, définir l’ordre

---

## 9) Décisions à prendre (recommandations)

- Nom UI : **Packs** (plutôt que Deck) pour éviter la confusion.
- Positionnement : un *pack* = sélection thématique "prête à réviser" (ordre recommandé et progression légers, optionnels), sans promesse de formation complète.
- Ordre : recommandé pour les officiels (via `position`), optionnel.
- Import : optionnel (mais très apprécié), à activer plus tard si besoin.

