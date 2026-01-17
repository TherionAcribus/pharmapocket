# Système de Packs (Decks officiels) — Vue d’ensemble

Dernière mise à jour : 2026-01-16

## 1. Concepts clés
- **Decks utilisateurs ("Mes decks")** : créés/édités par l’utilisateur pour organiser ses cartes. Un deck par défaut existe. Accès uniquement côté front/app utilisateur.
- **Packs (Decks officiels)** : sélection éditoriale préparée par l’équipe. Non éditables par l’utilisateur. Ordre recommandé via `sort_order` sur `DeckCard`.
- **Séparation UX** : ne pas mélanger. CMS/Pack Builder montrent uniquement les Packs officiels ; l’utilisateur voit seulement ses decks.

## 2. Modèles principaux
- `Deck`
  - `type`: `user` ou `official` (Packs).
  - `status`: brouillon/published (pour les packs officiels).
  - `description`, `difficulty`, `estimated_minutes`, `cover_image` (optionnelle), `sort_order`.
  - `user`: toujours `NULL` pour les packs officiels ; requis pour les decks utilisateur.
  - Validation : un pack officiel ne peut pas avoir d’owner ni être par défaut.
- `DeckCard` (Orderable / `sort_order`)
  - Relie un `Deck` à un `MicroArticlePage`.
  - `sort_order` gère l’ordre éditorial des cartes pour les packs officiels.
  - Champs additionnels : `is_optional`, `notes`.
- `UserDeckProgress`
  - Suivi de progression d’un utilisateur sur un pack officiel (start/progress APIs).

## 3. CMS / Wagtail
- Proxy `Pack` (basé sur `Deck`) enregistré comme **Snippet** Wagtail ; filtre `type = official`.
- Le snippet `Deck` a été retiré pour éviter d’éditer les decks utilisateur dans le CMS.
- InlinePanel sur `DeckCard` avec drag & drop (Wagtail Orderable).
- Champs affichés : nom, description, difficulty, estimated_minutes, status, cover_image, cartes.
- JS/CSS admin : `content/pack_admin.js` injecte un bouton « Ajout en masse » qui ouvre `/admin/packs/<id>/bulk-add/`; `pack_admin.css` rend la liste un peu plus compacte.
- Vue Django `/admin/packs/<id>/bulk-add/` (staff + perm change_pack) pour coller des IDs/slugs/URLs et ajouter en lot.

## 4. Pack Builder (frontend Next.js)
- Pages :
  - `/admin/packs` : liste + création pack officiel
  - `/admin/packs/[id]` : édition pack (métadonnées, cover, bulk add, reorder, search & add)
- Permissions : check staff via `/api/v1/auth/me/`
- UX :
  - bulk add via textarea (IDs/slug/URL)
  - recherche cartes (texte + filtres tags/taxonomies) + bouton d’ajout
  - drag & drop + “Enregistrer l’ordre”
  - upload cover : input fichier → `POST /admin/images/upload/` → `cover_image_id` mis à jour + aperçu image
- Data :
  - `cover_image_id` et `cover_image_url` renvoyés côté backend pour affichage

### Configuration front (URLs médias)
- Le backend renvoie des URLs **relatives** (`/media/...`). En dev, configure une base pour les médias :
  - `NEXT_PUBLIC_MEDIA_BASE=http://<host_backend>:8000`
  - fallback : `NEXT_PUBLIC_API_BASE`
- Le front résout alors les covers en `MEDIA_BASE + /media/...`. En prod, pointer vers l’URL publique des médias (CDN ou domaine backend).

## 5. APIs (publices)
- `/api/v1/content/decks/?type=official` : liste des packs publiés (ordre `sort_order`).
- `/api/v1/content/decks/<id>/` : détail d’un pack publié (cartes ordonnées par `sort_order`).
- `/api/v1/content/decks/<id>/start/` : démarre la progression (auth requis).
- `/api/v1/content/decks/<id>/progress/` : met à jour la progression (auth requis).

## 6. APIs (admin-only, staff)
Base : `/api/v1/content/admin/`
- `GET/POST packs/` : lister/créer pack officiel.
- `GET/PATCH/DELETE packs/<id>/` : détail, mise à jour, suppression.
- `POST packs/<id>/bulk-add/` : ajout en masse (string `items` ou listes `microarticle_ids` / `slugs`).
- `POST packs/<id>/cards/reorder/` : réordonner (payload `microarticle_ids` triés).
- `POST packs/<id>/cards/<cardId>/remove/` : retirer une carte.
- `GET microarticles/search/?q=` : recherche de cartes (limite ~30 résultats).

## 7. Permissions / sécurité
- Back : endpoints admin -> `is_staff` obligatoire (403 sinon). Auth session/CSRF standard.
- Front : redirection login ou discover si non staff.
- Validation modèle `Deck.clean()` assure la séparation user/officiel et interdit `is_default` sur les packs.

## 8. Données et ordering
- Pour les packs officiels, l’ordre des cartes est `DeckCard.sort_order` (Wagtail/Orderable et APIs admin/Pack Builder).
- Compatibilité API publique : le champ `position` renvoie `sort_order` pour les consumers existants.

## 9. Bulk add (deux parcours)
- CMS Wagtail : bouton « Ajout en masse » -> textarea `/admin/packs/<id>/bulk-add/`.
- Pack Builder front : textarea « Ajout en masse » + recherche + ajout unitaire. Les deux acceptent IDs / slugs (et URLs pour la vue Wagtail).

## 10. Limitations connues / pistes
- Vue inline Wagtail reste assez volumineuse (compactée via CSS mais non tabulaire). Le Pack Builder front offre une vue plus légère, mais reste un MVP (HTML5 DnD). Possible d’ajouter : recherche live dans la liste, filtres, tableaux collants.
- Aucun upload/gestion d’images côté Pack Builder (cover_image_id à saisir manuellement). On peut ajouter un sélecteur d’images Wagtail ou une liste déroulante si besoin.

## 11. Migrations / prérequis
- Champs ajoutés : `Deck.cover_image`, `DeckCard.sort_order` + migration de l’ancien `position` si existant.
- Modèles Wagtail : `Deck` -> ClusterableModel/InlinePanel, `DeckCard` -> Orderable avec `ParentalKey`.

## 12. Checklist de test rapide
- Staff : créer un pack via `/admin/packs`, ajouter 5+ cartes en masse, réordonner, retirer, supprimer.
- Non-staff : endpoints admin retournent 403, front `/admin/packs` redirige.
- API publique : `/api/v1/content/decks/?type=official` renvoie les packs publiés avec ordre correct.
