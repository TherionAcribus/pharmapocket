# Objectif
Ajouter une **couche d’abstraction intermédiaire** entre les **Packs** et les **fiches** afin de gérer proprement les sujets complexes (ex : *Délivrance isotrétinoïne*) avec :
- une **fiche récap** (vue d’ensemble / checklist / mindmap-lite) **quand elle existe**
- plusieurs **fiches détails** (atomiques, 1 règle actionnable par fiche)
- la possibilité qu’un même sujet soit présent dans **plusieurs Packs**
- des **modes d’affichage** : récaps seulement / détails seulement / les deux
- un mode de consultation qui peut **remplacer** les détails par la récap **quand elle existe**

⚠️ Contrainte existante : l’app gère déjà des **catégories** (médicament, pathologie, thème général, législation, etc.) + une notion de **mots-clés**. Il faut **retrouver ces métadonnées** sur les fiches récap.

---

# Problème initial
Certains thèmes contiennent **plusieurs informations importantes** sur un même “sujet” (ex : isotrétinoïne) : prescripteur, délais, test grossesse, carnet, etc.

Deux extrêmes insuffisants :
- **Tout regrouper sur une seule fiche** → trop dense, difficile à mémoriser et à maintenir.
- **Tout atomiser sans regroupement** → navigation difficile, perte de vue d’ensemble.

Solution retenue : **microlearning = 1 fiche = 1 idée**, organisée par une fiche “hub” récapitulative **quand nécessaire**.

---

# Concepts retenus
## 1) Packs (déjà existants)
- Ensemble thématique haut niveau.
- Ex : Pack « Acné », Pack « Isotrétinoïne ».

## 2) Nouvelle couche : *Sujet* (nom à finaliser)
Entité intermédiaire représentant un **sujet** ou **dossier**.

Rôle :
- Regrouper **0 ou 1 fiche récap** + **N fiches détails**.
- Être rattachable à **plusieurs Packs**.

⚠️ Nouveau : la fiche récap est **optionnelle**. Certains sujets peuvent n’avoir **que des fiches détails** (voire une seule), et cela suffit.

## 3) Fiches (Cards)
Les fiches récap sont des **Cards spécialisées** ("enfants" des fiches classiques) :
- même modèle de base (mêmes champs),
- `type=RECAP` + relations vers des fiches détails.

Types :
- **RÉCAP** : vue d’ensemble + liens vers détails.
- **DÉTAIL** : 1 règle / 1 décision / 1 point actionnable.

---

# Métadonnées : catégories + mots-clés (obligatoire)
Les fiches récap doivent être **retrouvables** via :
- filtres par **catégorie**
- recherche par **mots-clés**

Stratégies :
- V1 : saisie explicite sur la récap (contrôle éditorial)
- V2 : suggestion/agrégation depuis les détails (pré-remplissage)

---

# Relations entre entités (structure cible)
## Schéma conceptuel
**Pack → (plusieurs) Sujets → (récap optionnelle + détails)**

- Pack ↔ Sujet : **many-to-many**
- Sujet ↔ Card :
  - **0..1** Card de type `RECAP`
  - **1..N** Cards de type `DETAIL`

Important :
- Une Card récap doit pouvoir exister partout où une Card existe (affichage, recherche, favoris, etc.).

---

# Navigation attendue
## Depuis une fiche récap
- Checklist / liste structurée (mindmap-lite possible)
- Chaque point est cliquable → fiche détail

## Depuis une fiche détail
- Lien : retour au récap **si elle existe**
- Prev/Next (optionnel) au sein d’un Sujet

---

# Consultation : modes + substitution récap
## Modes d’affichage (filtres)
1) **Récaps uniquement**
2) **Détails uniquement**
3) **Mixte**

## Nouveau besoin : « substituer la récap quand elle existe »
Lors de la consultation (ex : dans un Pack / liste de cartes), proposer un mode :
- **"Afficher les récap à la place des détails (si disponibles)"**

Comportement exact :
- Si une Card détail appartient à un Sujet qui possède une récap → on affiche **la récap** dans la liste à la place de cette/ces détails.
- Si aucun Sujet/récap n’existe → on affiche la fiche détail normalement.

But UX :
- Permettre une consultation rapide "vue d’ensemble" sans perdre l’accès aux détails (toujours accessibles depuis la récap).

### Déduplication (recommandé)
Si plusieurs détails du même Sujet sont présents dans une liste (ex : recherche/tags), ne montrer la récap **qu’une seule fois**.

---

# Design / repérage visuel des fiches récap
- Badge **RÉCAP** + icône dédiée
- Style de fond/bordure distinct
- Catégorie + mots-clés visibles (chips)
- Lignes cliquables vers détails

---

# Mindmap vs liste : décision
- V1 : **liste structurée**
- V2 : **mindmap-lite** (arborescence indentée)
- V3 : mindmap interactive complète (si forte demande)

---

# Données / contraintes (proposition)
## Modèle minimal
- Pack
- Sujet
- Card

### Champs clés
Card :
- `type`: `RECAP` | `DETAIL`
- `category/categories`
- `keywords/tags`

### Relations
- `pack_sujet` (Pack↔Sujet)
- `sujet_card` (Sujet↔Card)
  - `order` (ordre des détails)
  - `label` (nom court du point)

Contraintes :
- **0..1** récap par Sujet (unicité si présente)

---

# Résultat attendu (pour le dev)
1) Ajouter l’entité Sujet.
2) Permettre des Sujets avec **récap optionnelle**.
3) Garantir que la récap est une Card standard (métadonnées incluses).
4) Navigation récap↔détails (retour conditionnel si récap existe).
5) Modes d’affichage (récap/détails/mixte).
6) Ajouter le mode de consultation : **substituer la récap à la place des détails quand disponible** + déduplication.
7) UI distincte pour récap.

---

# Notes d’implémentation
- Commencer V1 : liste structurée + liens + filtres + récap optionnelle.
- Implémenter substitution en lecture (pas besoin de modifier le contenu, juste la présentation).
- Prévoir la déduplication par `sujet_id`.

