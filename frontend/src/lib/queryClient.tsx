"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/client";
import type { ThumbOverridePublic } from "@/lib/api/content";
import { thumbOverridesQueryKey } from "@/lib/thumbOverridesQuery";

/**
 * Une erreur 4xx est définitive : réessayer ne change rien et retarde
 * l'affichage du message. Seules les pannes réseau / 5xx sont retentées.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Les fiches et taxonomies bougent peu : 30 s suffisent à dédoublonner
        // les requêtes d'une même navigation sans servir de données périmées.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function QueryProvider({
  children,
  initialThumbOverrides,
}: {
  children: React.ReactNode;
  /**
   * Overrides lus pendant le rendu serveur (layout racine). `null` si la
   * lecture a échoué : le cache n'est alors pas semé et le hook client refait
   * la requête lui-même.
   *
   * Valeur *initiale* au sens strict : elle n'est lue qu'à la création du
   * cache. Le layout racine n'étant jamais remonté d'une navigation à l'autre,
   * il n'y a pas de « nouvelle valeur serveur » à réinjecter — les mises à jour
   * ultérieures passent par l'invalidation TanStack, qui ne doit surtout pas
   * être écrasée par une donnée figée au premier chargement de l'onglet.
   */
  initialThumbOverrides?: ThumbOverridePublic[] | null;
}) {
  // `useState` (et non un singleton module) : chaque rendu serveur doit avoir
  // son propre cache, sinon les données d'un utilisateur fuiteraient vers un autre.
  const [client] = React.useState(() => {
    const queryClient = makeQueryClient();
    // Semé *avant* le premier rendu, et pas dans un effet : c'est toute la
    // différence entre une vignette peinte directement de la bonne couleur et
    // une vignette qui saute d'une couleur à l'autre après coup. Les cartes
    // rendues côté serveur sortent donc déjà avec leur couleur définitive, et
    // l'hydratation retrouve la même valeur — aucun écart à réconcilier.
    if (initialThumbOverrides) {
      queryClient.setQueryData(thumbOverridesQueryKey, initialThumbOverrides);
    }
    return queryClient;
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
