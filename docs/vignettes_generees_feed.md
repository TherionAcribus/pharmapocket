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

- **Génération vignette & helpers partagés** : `frontend/src/components/GeneratedThumb.tsx`
  - calcule couleurs/motifs + choisit icône + label
  - expose `resolveGeneratedThumbMeta`, `ThemeIcon`, `resolveTheme`, `resolveVisualCode` (réutilisés dans le header)

- **Types API** : `frontend/src/lib/types.ts`
  - expose les champs nécessaires pour piloter thème/maladie/médicament

- **Mapping API /discover feed** : `frontend/src/lib/api.ts`
  - `fetchDiscoverFeed()` mappe les champs `categories_*` renvoyés par `/api/v1/feed/`

- **Header (vue lecture)** : `frontend/src/app/micro/[slug]/ReaderClient.tsx`
  - badge thématisé dans le header (même logique que la vignette) via `resolveGeneratedThumbMeta` + `ThemeIcon`

---

## Données utilisées (API)
### Champs attendus côté frontend
La vignette se base principalement sur :
- `categories_theme_payload?: Array<{id,name,slug}>`
- `categories_maladies_payload?: Array<{id,name,slug,domain}>`
- `categories_medicament_payload?: Array<{id,name,slug}>`

Notes :
- Les champs historiques (`categories_pharmacologie_payload`, `categories_classes_payload`) existent encore en option côté types, mais la vignette générée utilise **thème/maladies/médicament**.
- `domain` n'est renseigné que sur la taxonomie **maladies** : c'est le domaine thérapeutique résolu (voir plus bas).

### Source backend (référence)
- Liste microarticles : `backend/content/views.py` (expose `categories_theme_payload`, `categories_maladies_payload`, `categories_medicament_payload`)
- Feed discover : `backend/product/views.py` (expose `categories_theme`, `categories_maladies`, `categories_medicament`)

---

## Règles de rendu

### 1) Couleur + motif (fond)
La couleur vient du **domaine thérapeutique** de la pathologie
(`categories_maladies_payload[0].domain`), le motif est tiré de façon
déterministe depuis le slug pour distinguer deux pathologies d'un même domaine.

Ordre de résolution, du plus prioritaire au moins prioritaire :

1. **Override par pathologie** — table `PathologyThumbOverride` (slug → bg/accent/motif),
   éditable dans `/admin/vignettes`. Sert à traiter un cas particulier.
2. **Domaine** — palette `DOMAIN_VISUALS` dans `GeneratedThumb.tsx`, indexée par les
   clés de `CategoryMaladies.Domain` (`infectio`, `cardio`, `endocrino`, `neuro`,
   `pneumo`, `gastro`, `dermato`, `rhumato`, `urogyneco`, `onco`, `ophtalmo`).
3. **`other`** — gris ardoise, quand la catégorie n'a ni domaine propre ni ancêtre
   qui en porte un.

#### D'où vient le domaine
C'est une donnée éditoriale, pas une devinette : le champ `domain` est porté par
les nœuds de l'arbre `CategoryMaladies` et se saisit dans Wagtail
(`Catégories maladies`). **Laisser le champ vide fait hériter du domaine de
l'ancêtre le plus proche** : en pratique on renseigne les racines
(« Infectiologie », « Cardiologie »…) et les pathologies filles suivent.

La résolution de l'héritage vit dans `backend/content/domains.py`. Elle lit
l'arbre entier en une requête et met le résultat en cache jusqu'à la prochaine
écriture sur la taxonomie (invalidation par signal, `backend/content/signals.py`),
ce qui évite un `get_ancestors()` par catégorie sérialisée dans le feed.

> Historique : le domaine était auparavant deviné côté client par
> `inferDomainFromPathologySlug`, qui ne connaissait que quelques mots-clés et
> rangeait tout le reste en gris. Cette heuristique a été élargie puis rejouée
> **une seule fois** dans la migration `0030_backfill_categorymaladies_domain`
> pour amorcer l'arbre ; elle ne tourne plus à l'exécution.

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

### Rattacher une pathologie à un domaine
Dans Wagtail, `Catégories maladies` → ouvrir le nœud → champ **Domaine**. Le
laisser vide pour hériter du parent. Aucune modification de code n'est nécessaire.

### Ajouter un nouveau domaine
1. Ajouter la valeur à `CategoryMaladies.Domain` (`backend/content/models.py`) et
   générer la migration.
2. Ajouter la même clé au type `Domain` et à `DOMAIN_VISUALS` dans
   `frontend/src/components/GeneratedThumb.tsx` (bg, accent, motifs).
3. Régénérer le contrat : `spectacular` puis `npm run types:generate`.

### Ajouter un nouveau thème
1. Créer/ajouter la catégorie dans `CategoryTheme` (backend).
2. Vérifier que le feed/liste renvoie bien `categories_theme_payload`.
3. Dans `frontend/src/components/GeneratedThumb.tsx` :
   - ajouter une règle de normalisation si besoin (synonymes / slug)
   - ajouter l’icône correspondante dans `ThemeIcon()`
4. Si besoin, le header de lecture (ReaderClient) bénéficie automatiquement du mapping (il consomme `resolveGeneratedThumbMeta`).

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

- **Couleurs inattendues / tout en gris** :
  - vérifier que la catégorie maladie (ou l'un de ses ancêtres) a bien un **Domaine**
    renseigné dans Wagtail — sans domaine, la vignette retombe sur `other` (gris)
  - vérifier que la réponse API contient bien `domain` dans `categories_maladies_payload`
  - vérifier qu'aucun `PathologyThumbOverride` ne s'applique au slug (il gagne sur le domaine)
