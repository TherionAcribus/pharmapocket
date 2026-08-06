"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/client";

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

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // `useState` (et non un singleton module) : chaque rendu serveur doit avoir
  // son propre cache, sinon les données d'un utilisateur fuiteraient vers un autre.
  const [client] = React.useState(makeQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
