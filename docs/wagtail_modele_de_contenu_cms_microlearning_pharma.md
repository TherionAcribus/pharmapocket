# Wagtail — Modèle de contenu & CMS (Microlearning Pharma)

## 1) Objectifs côté CMS
- Produire des **micro-articles très courts** et homogènes (lecture rapide en scroll)
- Permettre une **profondeur optionnelle** ("Voir plus") sans transformer les fiches en chapitres
- Préparer : i18n, quiz (questions liées), UGC + modération

---

## 2) Type de contenu principal : `MicroArticle`
### 2.1 Champs « feed » (niveau 1 — toujours court)
Ces champs alimentent la carte affichée dans le flux (scroll).
- **Titre-question** *(obligatoire)*
- **Réponse express** *(obligatoire — limite conseillée : 300–350 caractères)*
- **Points clés** *(obligatoire — 3 à 5 items ; limite conseillée : 90 caractères/item)*
- **À retenir** *(optionnel — 140 caractères)*
- **Image “cover”** *(optionnel — schéma/illustration simple)*
- **Liens** *(optionnel — 0 à 5 entrées structurées : titre, url, type, source, date)*
- **Articles liés (manuel)** *(optionnel — 0 à 5, pour garantir la qualité)*

> Recommandation : mettre des **validateurs** de longueur dès le départ.

### 2.2 Contenu « Voir plus » (niveau 2 — structuré en blocs)
Un **StreamField** limité (garde-fou éditorial) : ex. **max 3 blocs** au début.

Blocs proposés (activer progressivement) :
1. **Détail (court)** : texte 2–8 lignes
2. **Mécanisme en 3 étapes** : Cible → Action → Conséquence
3. **Indications** (liste courte)
4. **Effets indésirables fréquents** (liste)
5. **Points de vigilance** (CI / précautions / populations)
6. **Interactions (top 3–5)**
7. **Surveillance** (quoi + pourquoi)
8. **Image + légende**
9. **Références / sources** (structuré)
10. **Résumé final** (1 phrase)
11. **Questions associées** (références vers objets `Question`)

---

## 3) Contenu « Question » (stockage dès maintenant)
Créer un modèle `Question` (Snippet ou modèle Wagtail) pour saisir les questions pendant la rédaction des fiches.

Champs recommandés :
- `type` : QCM / Vrai-Faux / association (extensible)
- `prompt` : énoncé
- `choices` : liste (pour QCM)
- `correct_answer(s)`
- `explanation` : correction + explication (court mais clair)
- `difficulty` : 1–5
- `tags` + liens vers catégories (optionnel)
- `references` : sources

Relation :
- `MicroArticle` → (0..n) `Question`

---

## 4) Catégorisation dans Wagtail (liaisons)
Sur `MicroArticle`, prévoir :
- **3 taxonomies arborescentes** (multi-chemins) :
  - `categories_pharmacologie` (0..n)
  - `categories_maladies` (0..n)
  - `categories_classes` (0..n)
- **Tags** (facettes transversales) : `tags`

Implémentation conseillée :
- Taxonomies : **Snippets** + modèle « node » en arbre (Treebeard ou approche équivalente), M2M vers `MicroArticle`.
- Tags : système de tags simple (facettes), M2M.

---

## 5) Workflow éditorial (prépare UGC)
Même si UGC arrive plus tard, poser un workflow simple :
- **Brouillon → En relecture → Publié**
- Rôles :
  - Auteur (rédige)
  - Relecteur (valide)
  - Admin (publie + gère taxonomies)
- Historique/versioning : conserver l’audit (qui a modifié quoi).

---

## 6) Headless : comment Next.js consomme Wagtail
Deux approches possibles (à choisir une fois) :
1. **Wagtail headless** (API Wagtail) + endpoints custom si besoin (reco si le contenu est central)
2. **DRF** pour l’API et Wagtail pour l’édition (reco si beaucoup de logique “produit” côté API)

Dans les deux cas :
- Versionner l’API : `/api/v1/...`
- Prévoir filtres : tags, catégories, niveau, recherche

---



## 8) Garde-fous « microlearning » (très important)
- Limites de longueur sur champs du feed
- Limite du nombre de blocs dans le “Voir plus”
- Relectures : clarté, une idée principale par fiche
- Templates UI : carte uniforme (scroll), détails en accordéon

---

## 9) Évolutions prévues (compatibles)
- Quiz : UI + tentatives + score (les objets `Question` existent déjà)
- Badges : déclenchement via événements (LearningEvent)
- UGC : soumission + modération (workflow déjà en place)

