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
 * Les vignettes personnalisées, indexées par slug de pathologie.
 *
 * Appelé par chaque vignette de la liste : c'est TanStack Query qui garantit
 * une seule requête réseau et un cache partagé, sans provider dédié.
 */
export function useThumbOverrides(): {
  overrides: ThumbVisualOverrides | null;
  loading: boolean;
  error: string | null;
} {
  const { data, isPending, error } = useThumbOverridesQuery();

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
