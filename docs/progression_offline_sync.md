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
- `score_best` / `score_last` sont **toujours `null` en pratique** : rien ne les
  ecrit encore (voir § « Scores de quiz »).

## API backend
Endpoints exposes par `backend/learning/views.py`:
- `GET /api/v1/learning/progress/` : recupere toute la progression de l utilisateur
- `PATCH /api/v1/learning/progress/{lesson_id}/` : upsert d une lecon
- `POST /api/v1/learning/progress/import/` : import en batch

## Etat « lu » : une seule source de verite
`LessonProgress.completed` **est** l etat « lu ». Il n existe plus de modele
`MicroArticleReadState` (supprime par `content.0027`, apres backfill par
`learning.0004`) ni d ecriture dediee de l etat de lecture.

- `POST /api/v1/content/read-state/` (corps `{"slugs": [...]}`) est une
  **projection en lecture seule** de `LessonProgress.completed`, indexee par
  slug : le feed raisonne en slugs, la progression en `lesson_id`. Meme chose
  pour `is_read` dans le detail d une fiche. Le verbe POST ne trahit aucune
  ecriture : le feed accumule les slugs au fil du defilement infini et la query
  string finirait par depasser la limite de longueur d URL. Le lot est borne a
  `READ_STATE_MAX_SLUGS` (500) cote serveur, et `fetchMicroArticleReadStates`
  decoupe au-dela avant de refusionner les reponses.
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

Les deux regles de merge sur les scores (`score_last`, `score_best`) ne sont
**jamais exercees** aujourd hui, et aucun test ne les couvre : voir la section
suivante.

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

## Scores de quiz : transport pret, producteur absent
`score_best` / `score_last` traversent toute la chaine — modele
`LessonProgress`, `LessonProgressSerializer` / `LessonProgressUpdateSerializer`,
merge serveur `_merge_progress`, store local, PATCH unitaire et import batch —
mais **rien ne les ecrit** : aucun appel a `upsertLessonProgress` ne passe de
score. Ils valent donc `null` partout en production.

Ce n est pas un oubli de plomberie mais une feature non livree :
- les `Question` (QCM / vrai-faux) sont modelisees, editables en CMS et **deja
  servies au client** dans `MicroArticleDetail` (avec `choices` et
  `correct_answers`) ;
- mais `ReaderDetailsSheet` ne les affiche qu en lecture seule (enonce +
  explication, sans les propositions ni interaction), et `/quiz` est un
  placeholder « Bientot disponible ».

Consequence pour qui reprendra le sujet : **le score agrege ne demande aucun
nouvel endpoint**. Une UI de reponse qui calcule un score /100 en fin de serie
et appelle `upsertLessonProgress(lessonId, { score_last, score_best })` suffit ;
le sync existant fait remonter la valeur, et le merge serveur applique deja le
max sur `score_best`.

En revanche, la **persistance des reponses individuelles** n a rien : le modele
`LearningEvent` existe (prevu au cadrage pour `lesson_viewed`, `quiz_scored`,
`streak_day`, et le declenchement des badges) mais n est ni ecrit ni lu nulle
part — aucune vue, aucun serializer, aucune URL. Ce volet-la demandera bien un
endpoint d ecriture dedie.

## Limitations actuelles
- Stockage local utilise `localStorage` (pas IndexedDB).
- La progression n est pas utilisee pour trier/afficher dans le feed pour l instant.
- Aucun score de quiz n est produit : `score_best` / `score_last` restent `null`
  (§ « Scores de quiz »).

## Evolutions possibles
1) Migrer vers IndexedDB si volume de donnees important.
2) Ajouter une UI de debug (pending, last_sync_at).
3) Propager un resume de progression dans le feed (ex: vu / pourcentage).
