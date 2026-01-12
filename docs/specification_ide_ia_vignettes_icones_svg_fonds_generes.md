# Spécification pour l’IA de l’IDE
## Système de vignettes d’articles : icônes SVG fixes + fonds générés (couleur + motif)

> Objectif : remplacer l’usage d’images “contenu” (souvent illisibles en miniature) par un **code visuel stable** et **très lisible** en petit, cohérent sur toute l’app.

---

## 1) Principes UX / Design

### 1.1 Pourquoi ce choix
- Les schémas/illustrations d’articles sont généralement illisibles en miniature (48–72 px).
- Un code visuel (couleur + motif + icône) apporte :
  - reconnaissance instantanée (scan rapide),
  - cohérence,
  - performance (cache),
  - accessibilité (réduction de la dépendance au texte).

### 1.2 Règle d’or (stabilité)
- **Ne pas régénérer** une nouvelle “gélule”/“stéthoscope” à chaque vignette.
- Utiliser des **icônes SVG fixes** (thèmes + badges), puis générer uniquement **le fond** (couleur + motif) de façon déterministe.

### 1.3 Système hybride recommandé
- **Fond** = codage par **pathologie** (ou à défaut par domaine).
- **Icône centrale** = codage par **thème** (Pathologie / Médicament / Pharmacologie / Prévention / Conseil / Phytothérapie).
- **Badge coin** = codage par **type de contenu** (micro-article / astuce / traitement / mécanisme).

> Résultat : on évite l’effet “toujours la même image”, tout en gardant une identité visuelle stable.

---

## 2) Taxonomies (modèle mental)

### 2.1 Ne pas imbriquer “Diabète” sous “Médicament”
- La pathologie et la classe médicamenteuse sont des axes différents.
- Préférer des **facettes** :
  - Pathologies (multi)
  - Classes médicamenteuses (multi)
  - Thèmes / Types (1 ou multi selon besoin)

### 2.2 Ce que la vignette doit refléter
- **Pathologie** (ou Domaine) : pour le fond.
- **Thème** : icône centrale.
- **Type de contenu** : badge.

---

## 3) Assets : icônes libres (SVG)

### 3.1 Exigence
- Les icônes doivent être **libres et utilisables commercialement**.
- Conserver la **licence** dans le repo (fichier LICENSE/NOTICE).

### 3.2 Bibliothèques recommandées
- Phosphor (MIT)
- Lucide (ISC)
- Heroicons (MIT)
- Remix Icon (Apache 2.0)

> Choisir **une seule** librairie principale pour garder un style uniforme.

### 3.3 Mapping icônes (conceptuel)
#### Icône centrale (thème)
- Pathologie : stéthoscope OU loupe médicale
- Médicament : gélule/comprimé
- Pharmacologie : réseau moléculaire simplifié
- Prévention : bouclier
- Conseil : ampoule
- Phytothérapie : feuille

#### Badge (type de contenu)
- micro-article : document
- astuce : étoile
- traitement : croix médicale
- mécanisme : engrenage

---

## 4) Fonds générés (couleur + motif)

### 4.1 Contraintes
- Motif très léger : **opacité 5–10%**.
- Formes simples : lisibles en petit, pas de détails fins.
- Palette limitée : **2 à 4 couleurs max** (souvent 2 suffisent : bg + accent).

### 4.2 Mapping pathologie → (bg, accent, motif)
> La pathologie doit toujours produire le même rendu (déterministe). Exemples initiaux :
- Grippe : bg #6D5BD0, accent #D7D2FF, motif “ondes horizontales”
- Zona : bg #7A3E9D, accent #E6C8F7, motif “chevrons larges”
- Diabète : bg #2D74DA, accent #CFE3FF, motif “points réguliers (dot grid)”
- HTA : bg #D64545, accent #FFD0D0, motif “lignes verticales espacées”

### 4.3 Fallback si pathologie inconnue
- Utiliser la couleur par **domaine** :
  - infectio → #6D5BD0
  - cardio → #D64545
  - endocrino → #2D74DA
  - other → #444B59
- Motif par domaine (simple) :
  - infectio → ondes
  - cardio → lignes verticales
  - endocrino → points
  - other → diagonales

---

## 5) Génération / Composition (pipeline)

### 5.1 Recommandation d’implémentation
- Générer le fond (PNG) par code.
- Importer les icônes fixes (SVG) et soit :
  1) les pré-convertir en PNG (build step) puis composer via Pillow, **ou**
  2) composer en SVG puis rasterizer.

> Option 1 (PNG + Pillow) est la plus simple à maintenir.

### 5.2 Dimensions & placement
- Thumbnail carrée : 256×256 (source), affichage 48–72 px.
- Icône centrale : ~62% de la largeur.
- Badge : ~22% de la largeur, coin haut droit.
- Padding du badge : ~6%.

### 5.3 Caching
- Nommer le fichier de sortie de manière stable, ex :
  - `{pathology_slug}__{theme_slug}__{type_slug}.png`
- Si le fichier existe, ne pas regénérer.

---

## 6) Accessibilité
- Ne pas dépendre uniquement de la couleur.
- Prévoir :
  - un motif distinctif par pathologie/domaine,
  - des icônes bien différenciées,
  - (optionnel) un mini “chip” texte ailleurs dans l’UI (hors vignette) si nécessaire.

---

## 7) Exigences techniques pour l’IDE (tâches à exécuter)

### 7.1 Structure des dossiers (proposée)
- `assets/icons/themes/*.svg`
- `assets/icons/badges/*.svg`
- `assets/icons/themes_png/*.png` (si conversion)
- `assets/icons/badges_png/*.png` (si conversion)
- `assets/thumbs/*.png` (sorties générées)

### 7.2 Fonctions à implémenter
1) `slugify_fr(text) -> str`
2) `resolve_visual_code(pathology, domain_hint) -> {bg, accent, pattern}`
3) `render_background(size, bg, accent, pattern) -> Image`
4) `compose_thumbnail(background, theme_icon, badge_icon) -> Image`
5) `get_or_generate_thumbnail(key) -> path` (cache)

### 7.3 Tests minimaux
- Générer 4 vignettes (Grippe/Zona/Diabète/HTA) et vérifier :
  - fond correct (couleur & motif),
  - icône centrale centrée, non rognée,
  - badge visible et aligné,
  - export PNG correct.

---

## 8) “À faire ensuite” (évolutif)
- Étendre la table `pathology_map` à 20–30 pathologies prioritaires.
- Ajouter un mapping “domaine → palette” si le contenu se développe.
- Prévoir une UI de debug interne : afficher la clé + couleurs + motif + icônes.

---

## 9) Critères d’acceptation
- Les vignettes restent **identiques** (icône centrale/badge) d’une génération à l’autre.
- Le fond est **cohérent** pour une pathologie donnée.
- La vignette est **lisible** à 48 px.
- Aucune dépendance à une image de contenu illisible.
- Les licences des icônes sont stockées dans le repo.
