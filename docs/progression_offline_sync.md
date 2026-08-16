# Progression offline + sync

## Objectif
Permettre un suivi de progression local (offline-first) avec une synchronisation automatique
des donnees vers le backend quand l utilisateur est connecte.

## Stockage local (client)
- Stockage: `localStorage`
- Cle: `pp_progress_v1`
- Format (schema v1):
```json
{
  "schema_version": 1,
  "device_id": "uuid",
  "locale": "fr-FR",
  "lessons": {
    "123": {
      "seen": true,
      "completed": false,
      "percent": 40,
      "time_ms": 120000,
      "score_best": null,
      "score_last": null,
      "updated_at": "2026-01-12T10:20:30.000Z",
      "last_seen_at": "2026-01-12T10:20:30.000Z",
      "manually_unread": false
    }
  },
  "pending": ["123"],
  "last_sync_at": "2026-01-12T10:21:00.000Z"
}
```

Notes:
- `pending` contient les lecons qui doivent etre synchronisees.
- `updated_at` est utilise pour les merges (comparaison de dates).
- `time_ms` est accumule localement avec un cap par session.
- `manually_unread` est **purement local** : le serveur ne le connait pas et
  `getPendingLessons` le retire du payload. C est une intention d affichage
  (« ne pas re-marquer cette fiche toute seule »), pas une donnee de progression.

## API backend
Endpoints exposes par `backend/learning/views.py`:
- `GET /api/v1/learning/progress/` : recupere toute la progression de l utilisateur
- `PATCH /api/v1/learning/progress/{lesson_id}/` : upsert d une lecon
- `POST /api/v1/learning/progress/import/` : import en batch

## Etat « lu » : une seule source de verite
`LessonProgress.completed` **est** l etat « lu ». Il n existe plus de modele
`MicroArticleReadState` (supprime par `content.0027`, apres backfill par
`learning.0004`) ni de `POST /api/v1/content/read-state/`.

- `GET /api/v1/content/read-state/?slugs=...` est une **projection en lecture
  seule** de `LessonProgress.completed`, indexee par slug : le feed raisonne en
  slugs, la progression en `lesson_id`. Meme chose pour `is_read` dans le detail
  d une fiche.
- Cote client, la seule ecriture est `setLessonCompletion` dans le store local ;
  c est le sync qui remonte la valeur au serveur, et qui retente tant que la
  lecon reste dans `pending`. Marquer lu/non lu n est donc jamais annule par un
  echec reseau.
- A l affichage (feed, pack, lecteur), le local prime sur la reponse serveur
  quand il connait la fiche (`getLocalReadState`) : la map serveur peut avoir un
  cycle de sync de retard, et sans cette regle un « marquer non lu » se verrait
  reannule a l ecran.

### Auto-lecture (lecteur)
Ouvrir une fiche ne suffit pas a la marquer lue : `useAutoRead`
(`frontend/src/app/micro/[slug]/reader/useReaderCardState.ts`) attend
**5 s passees a l ecran** (le compte est suspendu quand l onglet est masque) ou
un **defilement jusqu a 60 % de la page**, le premier des deux. Sans ce delai,
un aller-retour dans le deck ou un simple remontage du composant marquait la
fiche lue.

Un « non lu » explicite (bouton lu / non lu) pose `manually_unread` et desarme
definitivement l auto-lecture pour cette fiche : elle ne repassera « lue » que
si l utilisateur la marque lui-meme. Un « lu » explicite leve le verrou.

## Regles de merge
Local -> Serveur:
- le client envoie uniquement les lecons en `pending`.
- le client envoie toujours un `time_ms` **cumule** (jamais un delta) : il accumule
  les deltas localement dans `upsertLessonProgress`.
- le serveur merge (meme logique pour le PATCH unitaire et pour l import batch):
  - `updated_at` le plus recent gagne sur `seen/completed/percent/score_last/last_seen_at`
  - `time_ms` prend le max
  - `score_best` prend le max

Le `time_ms` ne doit **jamais** etre additionne cote serveur : le client renvoyant
un total cumule, chaque sync reinjecterait le total deja stocke et le temps
exploserait a chaque cycle (le max rend aussi l import idempotent en cas de retry).

Serveur -> Local:
- si `updated_at` serveur > local, le local est remplace.
- si le local est plus recent, on garde le local et on laisse la lecon en `pending`.
- `manually_unread` survit au remplacement (le serveur ne l envoie pas) sauf si la
  ligne serveur est `completed: true` : la fiche a alors ete marquee lue quelque
  part, le verrou n a plus lieu d etre.

## Declencheurs de sync
Implementes dans `frontend/src/lib/progressSync.ts`:
- a la connexion (enable sync)
- au retour en ligne (`online`)
- au retour en visibilite (`visibilitychange`)
- toutes les 5 minutes si `pending` non vide

## Points d integration
- `frontend/src/lib/progressStore.ts`:
  - gestion du state local, queue `pending`
  - helper `markLessonSeen`, `addLessonTime`, `setLessonCompletion`
- `frontend/src/lib/progressSync.ts`:
  - sync batch via `importLessonProgress`
  - refresh via `fetchLessonProgress`
- `frontend/src/app/micro/[slug]/reader/useReaderCardState.ts`:
  - mark seen a l ouverture
  - time_ms a la fermeture
  - completion a l ouverture (ouvrir vaut lecture) et sur le bouton lu/non lu
- `frontend/src/components/MobileScaffold.tsx`:
  - active le loop de sync si l utilisateur est connecte

## Limitations actuelles
- Stockage local utilise `localStorage` (pas IndexedDB).
- La progression n est pas utilisee pour trier/afficher dans le feed pour l instant.

## Evolutions possibles
1) Migrer vers IndexedDB si volume de donnees important.
2) Ajouter une UI de debug (pending, last_sync_at).
3) Propager un resume de progression dans le feed (ex: vu / pourcentage).
