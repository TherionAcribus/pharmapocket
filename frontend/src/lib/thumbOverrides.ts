"use client";

import * as React from "react";

import { useThumbOverridesQuery } from "@/lib/queries";
import type { PatternName } from "@/components/thumbPatterns";
import { normalizePattern } from "@/components/thumbPatterns";

export type VisualCode = {
  bg: string;
  accent: string;
  pattern: PatternName;
};

export type ThumbVisualOverrides = Record<string, VisualCode>;

/**
 * Dernier échec déjà tracé, au niveau module et pas par composant.
 *
 * Toutes les vignettes montées partagent la même requête, donc le même objet
 * d'erreur : sans ce garde-fou, une liste de 30 cartes produirait 30 lignes
 * identiques en console. Remis à zéro dès qu'une lecture réussit, pour qu'un
 * échec ultérieur portant le même message soit retracé.
 */
const lastLoggedError = { message: null as string | null };

/**
 * Les vignettes personnalisées, indexées par slug de pathologie.
 *
 * Appelé par chaque vignette de la liste : c'est TanStack Query qui garantit
 * une seule requête réseau et un cache partagé, sans provider dédié.
 *
 * En cas d'échec, `overrides` reste `null` et les vignettes retombent sur la
 * palette générée depuis le domaine : la dégradation est volontaire (une couleur
 * personnalisée absente ne justifie pas une carte vide ou un écran d'erreur),
 * mais elle est tracée ici — sinon un endpoint cassé passe inaperçu, l'affichage
 * restant plausible.
 */
export function useThumbOverrides(): {
  overrides: ThumbVisualOverrides | null;
  loading: boolean;
  error: string | null;
} {
  const { data, isPending, error } = useThumbOverridesQuery();

  React.useEffect(() => {
    if (!error) {
      lastLoggedError.message = null;
      return;
    }
    if (lastLoggedError.message === error.message) return;
    lastLoggedError.message = error.message;
    console.warn(
      "useThumbOverrides: lecture des overrides de vignettes en échec, retour aux couleurs générées",
      { error }
    );
  }, [error]);

  const overrides = React.useMemo<ThumbVisualOverrides | null>(() => {
    if (!data) return null;
    const map: ThumbVisualOverrides = {};
    for (const r of data) {
      const slug = (r?.pathology_slug ?? "").trim().toLowerCase();
      const bg = (r?.bg ?? "").trim();
      const accent = (r?.accent ?? "").trim();
      const pattern = normalizePattern(r?.pattern);
      if (!slug || !bg || !accent || !pattern) continue;
      map[slug] = { bg, accent, pattern };
    }
    return map;
  }, [data]);

  return {
    overrides,
    loading: isPending,
    error: error ? error.message : null,
  };
}
