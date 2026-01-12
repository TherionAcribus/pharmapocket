# Vignettes générées (thumbnails) dans le feed

## Objectif
Dans le feed (liste des micro-cartes), on n’affiche **pas** l’illustration de contenu (`cover_image_url`) car elle est souvent illisible en miniature.

À la place, on affiche une **vignette générée** :
- fond couleur + motif léger (déterministe)
- icône centrale (déterminée par le **Thème**)
- libellé court (pathologie/classe/thème selon règles)

L’illustration (`cover_image_url`) est conservée pour l’écran de lecture/détail.

---

## Où ça vit dans le code
- **UI (feed)** : `frontend/src/components/MicroCard.tsx`
  - affiche toujours `GeneratedThumb` dans le carré `h-16 w-16`
  - ne rend plus `cover_image_url` dans la liste

- **Génération vignette** : `frontend/src/components/GeneratedThumb.tsx`
  - calcule couleurs/motifs + choisit icône + label

- **Types API** : `frontend/src/lib/types.ts`
  - expose les champs nécessaires pour piloter thème/maladie/médicament

- **Mapping API /discover feed** : `frontend/src/lib/api.ts`
  - `fetchDiscoverFeed()` mappe les champs `categories_*` renvoyés par `/api/v1/feed/`

---

## Données utilisées (API)
### Champs attendus côté frontend
La vignette se base principalement sur :
- `categories_theme_payload?: Array<{id,name,slug}>`
- `categories_maladies_payload?: Array<{id,name,slug}>`
- `categories_medicament_payload?: Array<{id,name,slug}>`

Notes :
- Les champs historiques (`categories_pharmacologie_payload`, `categories_classes_payload`) existent encore en option côté types, mais la vignette générée utilise **thème/maladies/médicament**.

### Source backend (référence)
- Liste microarticles : `backend/content/views.py` (expose `categories_theme_payload`, `categories_maladies_payload`, `categories_medicament_payload`)
- Feed discover : `backend/product/views.py` (expose `categories_theme`, `categories_maladies`, `categories_medicament`)

---

## Règles de rendu

### 1) Couleur + motif (fond)
- Basé sur la **pathologie** (`categories_maladies_payload[0]`) quand présente.
- Mappings “forts” (exemples initiaux) :
  - `grippe` → bg `#6D5BD0` / accent `#D7D2FF` / motif `waves`
  - `zona` → bg `#7A3E9D` / accent `#E6C8F7` / motif `chevrons`
  - `diabete` → bg `#2D74DA` / accent `#CFE3FF` / motif `dots`
  - `hta` → bg `#D64545` / accent `#FFD0D0` / motif `vlines`

- Fallback : si pathologie inconnue, on choisit un “domaine” via heuristique sur le slug (infectio/cardio/endocrino/other), puis un motif déterministe.

### 2) Icône centrale (déterminée par le Thème)
La source de vérité est :
- `categories_theme_payload[0]` (slug ou name)

Le code normalise le slug/name (minuscules, accents supprimés) et résout une clé de thème.

Thèmes pris en charge (actuels) :
- `Conseils` → icône `Lightbulb`
- `Pathologie` → icône `Stethoscope`
- `Médicament` → icône `Pill`
- `Prévention` → icône `Shield`
- `Phytothérapie` → icône `Leaf`
- `MAD` → icône `Scale`
- `Législation` → icône `Gavel`

> Aujourd’hui, on utilise **Lucide** (`lucide-react`) car déjà présent dans le frontend. Le mapping d’icônes est centralisé dans `GeneratedThumb.tsx`.

### 3) Texte (label en bas)
Règles :
- Si Thème = **Pathologie** → afficher le nom de la catégorie **Maladies** (`categories_maladies_payload[0].name`)
- Si Thème = **Médicament** → afficher le nom de la catégorie **Médicament** (`categories_medicament_payload[0].name`)
- Sinon → afficher le **nom du Thème** (`categories_theme_payload[0].name`)

Le label est tronqué pour rester lisible en 64px.

---

## Personnaliser / étendre

### Ajouter un nouveau thème
1. Créer/ajouter la catégorie dans `CategoryTheme` (backend).
2. Vérifier que le feed/liste renvoie bien `categories_theme_payload`.
3. Dans `frontend/src/components/GeneratedThumb.tsx` :
   - ajouter une règle de normalisation si besoin (synonymes / slug)
   - ajouter l’icône correspondante dans `ThemeIcon()`

### Changer de librairie d’icônes (ex: passer à Phosphor)
- Point unique à modifier : `frontend/src/components/GeneratedThumb.tsx`
  - remplacer les imports Lucide
  - adapter `ThemeIcon()`

---

## Dépannage (symptômes fréquents)
- **Toujours la même icône** :
  - vérifier que `categories_theme_payload` est bien rempli dans la réponse API
  - vérifier que `fetchDiscoverFeed()` mappe bien `categories_theme_payload`

- **Label vide** :
  - Pathologie : vérifier `categories_maladies_payload`
  - Médicament : vérifier `categories_medicament_payload`

- **Couleurs inattendues** :
  - vérifier le `slug` de la maladie (ex: `diabete` vs `diabète`)
  - compléter le mapping hardcodé dans `resolveVisualCode()`
