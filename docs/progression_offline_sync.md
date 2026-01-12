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
      "last_seen_at": "2026-01-12T10:20:30.000Z"
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

## API backend
Endpoints exposes par `backend/learning/views.py`:
- `GET /api/v1/learning/progress/` : recupere toute la progression de l utilisateur
- `PATCH /api/v1/learning/progress/{lesson_id}/` : upsert d une lecon
- `POST /api/v1/learning/progress/import/` : import en batch (merge "sum" pour time_ms)

## Regles de merge
Local -> Serveur:
- le client envoie uniquement les lecons en `pending`.
- le serveur merge:
  - `updated_at` le plus recent gagne sur `seen/completed/percent/score_last/last_seen_at`
  - `time_ms` merge par somme (import)
  - `score_best` prend le max

Serveur -> Local:
- si `updated_at` serveur > local, le local est remplace.
- si le local est plus recent, on garde le local et on laisse la lecon en `pending`.

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
- `frontend/src/app/micro/[slug]/ReaderClient.tsx`:
  - mark seen a l ouverture
  - time_ms a la fermeture
  - completion quand la carte est marquee lue
- `frontend/src/components/MobileScaffold.tsx`:
  - active le loop de sync si l utilisateur est connecte

## Limitations actuelles
- Stockage local utilise `localStorage` (pas IndexedDB).
- La progression n est pas utilisee pour trier/afficher dans le feed pour l instant.

## Evolutions possibles
1) Migrer vers IndexedDB si volume de donnees important.
2) Ajouter une UI de debug (pending, last_sync_at).
3) Propager un resume de progression dans le feed (ex: vu / pourcentage).
