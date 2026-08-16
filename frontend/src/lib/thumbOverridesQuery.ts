/**
 * Descripteur partagé de la requête « overrides de vignettes ».
 *
 * Il vit hors de `lib/queries.ts` parce que le layout serveur doit lire la même
 * clé de cache et la même durée de fraîcheur que le hook client : or tout export
 * d'un module marqué `"use client"` devient, vu d'un composant serveur, une
 * référence client opaque — un objet proxy qu'on ne peut ni lire ni appeler
 * pendant le rendu serveur. Ce module-ci n'a pas de directive : il est lisible
 * des deux côtés.
 */

import { fetchThumbOverridesPublic, type ThumbOverridePublic } from "@/lib/api/content";

export const thumbOverridesQueryKey = ["thumb-overrides"] as const;

/**
 * Données quasi statiques (une poignée de couleurs éditoriales), relues par
 * toutes les vignettes d'une liste : dix minutes de fraîcheur évitent tout
 * rechargement pendant une session de navigation normale.
 */
export const THUMB_OVERRIDES_STALE_TIME = 10 * 60_000;

/**
 * Durée de mise en cache du préchargement serveur, côté Next.
 *
 * Volontairement plus courte que `THUMB_OVERRIDES_STALE_TIME` : ce cache-là est
 * partagé par tous les visiteurs, donc une modification faite dans l'admin doit
 * s'y propager vite. Une minute, plutôt que dix, borne le délai entre
 * l'enregistrement d'un override et son apparition sur un chargement neuf,
 * pour un coût négligeable (l'endpoint est minuscule et la réponse est
 * mutualisée entre toutes les requêtes de la période).
 *
 * Alignée sur le `max-age` du `Cache-Control` renvoyé par l'API
 * (`_PUBLIC_MAX_AGE` dans `backend/content/views/thumbs.py`) : le cache de
 * données de Next n'obéit pas aux en-têtes HTTP amont, il faut donc redire ici
 * ce que le serveur annonce — sans quoi les deux couches expireraient à des
 * rythmes différents sans que rien ne le signale.
 */
const SSR_REVALIDATE_SECONDS = 60;

export const thumbOverridesQueryOptions = {
  queryKey: thumbOverridesQueryKey,
  // Enveloppé dans une lambda : TanStack passe un `QueryFunctionContext` en
  // premier argument, qu'on ne veut pas voir atterrir dans le `RequestInit`.
  queryFn: () =>
    fetchThumbOverridesPublic({
      // `no-cache` plutôt que le `no-store` par défaut du transport : le
      // navigateur revalide *systématiquement* — jamais de couleur périmée
      // après une édition dans l'admin — mais il joint cette fois son
      // `If-None-Match`, et l'API répond 304 sans corps tant que rien n'a
      // changé. `no-store` interdisait jusqu'à l'envoi du validateur, donc
      // retéléchargeait la liste entière à chaque appel.
      cache: "no-cache",
    }),
  staleTime: THUMB_OVERRIDES_STALE_TIME,
};

/**
 * Lecture des overrides pendant le rendu serveur, pour semer le cache TanStack
 * avant le premier rendu client (voir `QueryProvider`).
 *
 * Sans ce préchargement, la requête ne part qu'au montage de la première
 * vignette — donc forcément après le chargement de la liste qui la contient :
 * chaque vignette peignait la palette générée depuis le domaine, puis sautait
 * sur sa couleur personnalisée à l'arrivée de la réponse. La course était
 * perdue d'avance, pas simplement serrée.
 *
 * L'échec est absorbé, comme côté client : une couleur personnalisée manquante
 * ne justifie pas de faire échouer le rendu de toute l'application (le layout
 * racine est traversé par *toutes* les routes, y compris celles qui n'affichent
 * aucune vignette). On retombe alors sur l'ancien comportement — la requête
 * repart depuis le navigateur — flash compris.
 */
export async function fetchThumbOverridesForSsr(): Promise<ThumbOverridePublic[] | null> {
  try {
    return await fetchThumbOverridesPublic({
      cache: "force-cache",
      next: { revalidate: SSR_REVALIDATE_SECONDS },
    });
  } catch (error) {
    console.warn(
      "fetchThumbOverridesForSsr: préchargement serveur des overrides de vignettes en échec, la requête repartira depuis le navigateur",
      { error }
    );
    return null;
  }
}
