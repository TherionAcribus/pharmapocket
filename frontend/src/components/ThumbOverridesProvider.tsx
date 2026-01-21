"use client";

import * as React from "react";

import { fetchThumbOverridesPublic } from "@/lib/api";

type PatternName = "waves" | "chevrons" | "dots" | "vlines" | "diagonals";

export type VisualCode = {
  bg: string;
  accent: string;
  pattern: PatternName;
};

export type ThumbVisualOverrides = Record<string, VisualCode>;

type ThumbOverridePublic = {
  pathology_slug: string;
  bg: string;
  accent: string;
  pattern: PatternName;
};

type ThumbOverridesContextValue = {
  overrides: ThumbVisualOverrides | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const ThumbOverridesContext = React.createContext<ThumbOverridesContextValue | null>(null);

function normalizePattern(value: unknown): PatternName | null {
  if (value === "waves" || value === "chevrons" || value === "dots" || value === "vlines" || value === "diagonals") {
    return value;
  }
  return null;
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function ThumbOverridesProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = React.useState<ThumbVisualOverrides | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = (await fetchThumbOverridesPublic()) as ThumbOverridePublic[];
      const map: ThumbVisualOverrides = {};
      for (const r of rows) {
        const slug = (r?.pathology_slug ?? "").trim().toLowerCase();
        const bg = (r?.bg ?? "").trim();
        const accent = (r?.accent ?? "").trim();
        const pattern = normalizePattern((r as { pattern?: unknown })?.pattern);
        if (!slug || !bg || !accent || !pattern) continue;
        map[slug] = { bg, accent, pattern };
      }
      setOverrides(map);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
      setOverrides(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const value = React.useMemo<ThumbOverridesContextValue>(
    () => ({ overrides, loading, error, reload }),
    [overrides, loading, error, reload]
  );

  return <ThumbOverridesContext.Provider value={value}>{children}</ThumbOverridesContext.Provider>;
}

export function useThumbOverrides() {
  const ctx = React.useContext(ThumbOverridesContext);
  if (!ctx) {
    return { overrides: null as ThumbVisualOverrides | null, loading: false, error: null as string | null, reload: async () => {} };
  }
  return ctx;
}
