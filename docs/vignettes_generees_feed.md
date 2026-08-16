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

- **Chargement des overrides** : `frontend/src/lib/thumbOverridesQuery.ts`
  - clé de cache, fraîcheur et fonction de lecture, partagées entre le serveur et
    le client (voir « Comment les overrides arrivent jusqu'à la vignette »)

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

### 0) Catégorie principale (préalable à tout le reste)
Une carte peut porter plusieurs catégories par taxonomie, et **l'API ne garantit
aucun ordre** : `_taxonomy_payload` sérialise les M2M sans `order_by`, donc
l'ordre est celui que rend la base et peut bouger sans qu'aucune donnée
éditoriale ne change. Prendre `payload[0]` faisait donc changer la vignette
(couleur, motif, label) d'une réponse à l'autre.

La vignette élit donc une **catégorie principale** de façon déterministe
(`pickPrincipal` / `pickPrincipalPathology` dans `GeneratedThumb.tsx`) :
1. pour les **maladies**, les catégories qui portent un `domain` résolu passent
   devant celles qui retomberaient sur `other` (gris) ;
2. à égalité, on garde le **slug le plus petit** (comparaison par code point, pas
   `localeCompare`, pour ne pas dépendre de l'ICU du runtime) ;
3. pour thème et médicament, seule la règle du slug s'applique.

Conséquence : la vignette d'une carte ne bouge que si son éditorial bouge.

### 1) Couleur + motif (fond)
La couleur vient du **domaine thérapeutique** de la pathologie principale
(`domain`), le motif est tiré de façon déterministe depuis son slug pour
distinguer deux pathologies d'un même domaine. Le seed du motif est ce seul
slug : ajouter une pathologie secondaire à une carte ne la repeint pas.

Ordre de résolution, du plus prioritaire au moins prioritaire :

1. **Override par pathologie** — table `PathologyThumbOverride` (slug → bg/accent/motif),
   éditable dans `/admin/vignettes`. Sert à traiter un cas particulier. Le slug doit
   exister dans `CategoryMaladies` : l'API refuse (`unknown pathology_slug`) un slug
   hors taxonomie, qui produirait une ligne créée sans erreur mais appliquée à aucune
   fiche (voir « Overrides orphelins » plus bas).
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
- la catégorie **thème** principale (slug ou name)

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
- Si Thème = **Pathologie** → afficher le nom de la catégorie **Maladies** principale
- Si Thème = **Médicament** → afficher le nom de la catégorie **Médicament** principale
- Sinon → afficher le **nom du Thème** principal

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

## Comment les overrides arrivent jusqu'à la vignette

Les couleurs personnalisées sont **préchargées pendant le rendu serveur**, pas
demandées au montage des vignettes. La chaîne :

1. `app/layout.tsx` (composant serveur, traversé par toutes les routes) appelle
   `fetchThumbOverridesForSsr()`. La réponse est mise en cache par Next pendant
   60 s : l'attente n'est payée qu'une fois par période, pas à chaque visiteur.
2. Le layout passe la liste à `QueryProvider`, qui **sème le cache TanStack à sa
   création**, avant le premier rendu — sous la clé `["thumb-overrides"]`,
   exactement celle que lira `useThumbOverridesQuery`.
3. `useThumbOverrides` trouve donc les données déjà présentes : elle ne déclenche
   aucune requête (fraîcheur de 10 min) et la vignette est peinte directement de
   sa couleur définitive, aussi bien dans le HTML serveur qu'à l'hydratation.

Pourquoi ce détour plutôt qu'un simple `useQuery` : la requête ne partait
qu'au montage de la **première vignette**, donc nécessairement après le
chargement de la liste qui la contient. Chaque vignette affichait la palette
générée depuis le domaine puis sautait sur sa couleur personnalisée à l'arrivée
de la réponse — une course perdue d'avance, qu'aucun `staleTime` ne pouvait
gagner puisque le cache est vide au premier chargement de l'onglet.

Conséquences à connaître :

- une modification faite dans `/admin/vignettes` met **jusqu'à 60 s** à
  apparaître sur un chargement de page neuf (cache Next). Dans l'onglet de
  l'admin, elle est immédiate : les mutations invalident la requête ;
- si le préchargement serveur échoue (API injoignable au moment du rendu), rien
  ne casse : un `console.warn` est tracé côté serveur, le cache n'est pas semé et
  le client refait la requête lui-même — avec le flash d'origine.

### L'endpoint public est cacheable

`GET /api/v1/content/thumb-overrides/` renvoie
`Cache-Control: public, max-age=60, stale-while-revalidate=300` et un `ETag`.
Trois choses à savoir sur ce réglage :

- **`max-age=60` redit ce que le front connaît déjà** : le cache de données de
  Next n'obéit pas aux en-têtes HTTP amont, sa durée vient de
  `next: { revalidate }`. Les deux valeurs sont volontairement identiques —
  si l'une bouge, bouger l'autre (`_PUBLIC_MAX_AGE` côté Django,
  `SSR_REVALIDATE_SECONDS` côté Next).
- **L'`ETag` est un hachage de la charge utile**, pas un `MAX(updated_at)` :
  une écriture qui contourne `save()` (`queryset.update()`, `loaddata`, shell)
  ne touche pas `updated_at` et laisserait un validateur menteur.
- **La vue ne déclare aucun authenticator** (`authentication_classes = []`).
  La réponse est la même pour tout le monde ; surtout, authentifier lirait la
  session, et `SessionMiddleware` ajouterait alors `Vary: Cookie` — ce qui
  découperait le cache partagé par utilisateur et annulerait le `public`.
  Contrepartie : un appel authentifié compte désormais dans le budget de débit
  anonyme (par IP), le rendu serveur restant exempté via `THROTTLE_EXEMPT_IPS`.

Côté navigateur, la requête part en `cache: "no-cache"` : elle revalide toujours
(donc jamais de couleur périmée après une édition) mais joint son
`If-None-Match`, et reçoit un **304 sans corps** tant que rien n'a changé.

**Pas de pagination, volontairement** : une vignette a besoin de la table entière
pour résoudre *son* slug, paginer transformerait donc une requête en N. La
réponse est de l'ordre de la centaine d'octets par pathologie personnalisée, et
elle est désormais lue une fois par minute pour l'ensemble des visiteurs. Si le
volume devenait un jour un problème, la piste n'est pas la pagination mais soit
un filtrage par les slugs réellement à l'écran (au prix d'un cache fragmenté par
page), soit la sérialisation du visuel résolu directement dans la charge utile
des cartes.

---

## Dépannage (symptômes fréquents)
- **Toujours la même icône** :
  - vérifier que `categories_theme_payload` est bien rempli dans la réponse API
  - vérifier que `fetchDiscoverFeed()` mappe bien `categories_theme_payload`

- **Label vide** :
  - Pathologie : vérifier `categories_maladies_payload`
  - Médicament : vérifier `categories_medicament_payload`

- **Overrides orphelins (slug hors taxonomie)** : il n'y a **aucune clé étrangère**
  entre `PathologyThumbOverride.pathology_slug` et `CategoryMaladies.slug` — le
  rapprochement se fait côté client, par égalité de slug. Un slug qui ne désigne
  aucune pathologie donne donc un override silencieusement mort. Deux garde-fous :
  - le serializer refuse un slug absent de `CategoryMaladies` à la création comme au
    changement de slug (`ThumbOverrideCreateSerializer` / `ThumbOverridePatchSerializer`) ;
    un PATCH qui laisse le slug inchangé reste accepté, pour que les lignes héritées
    d'avant ce contrôle restent modifiables et supprimables ;
  - `/admin/vignettes` marque ces lignes héritées d'un badge « slug inconnu », et
    « Dupliquer » ne recopie que l'apparence (le slug est à choisir dans la taxonomie).

- **Un override modifié n'apparaît pas tout de suite** (hors onglet admin) :
  cache Next de 60 s sur le préchargement serveur, voir la section précédente.
  Un rechargement passé ce délai suffit ; inutile de vider le cache navigateur.

- **Les vignettes sautent d'une couleur à l'autre au chargement** : le
  préchargement serveur n'a pas eu lieu. Vérifier le `console.warn` de
  `fetchThumbOverridesForSsr` dans les logs Next (API injoignable depuis le
  serveur Next, pas depuis le navigateur — les deux n'ont pas forcément la même
  URL de base ni la même résolution DNS, cf. `getApiBaseUrl`).

- **Un override ne s'applique pas sur une carte à plusieurs pathologies** :
  l'override est indexé par le slug de la pathologie **principale** (règle ci-dessus,
  section 0) — vérifier qu'il vise bien celle-là et pas une pathologie secondaire.

- **Couleurs inattendues / tout en gris** :
  - vérifier que la catégorie maladie (ou l'un de ses ancêtres) a bien un **Domaine**
    renseigné dans Wagtail — sans domaine, la vignette retombe sur `other` (gris)
  - vérifier que la réponse API contient bien `domain` dans `categories_maladies_payload`
  - vérifier qu'aucun `PathologyThumbOverride` ne s'applique au slug (il gagne sur le domaine)
