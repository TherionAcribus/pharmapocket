import { apiGet, apiJson, jsonBody } from "@/lib/api/client";
import type { LandingPayload, MicroArticleDetail, MicroArticleListItem } from "@/lib/types";

/**
 * Détail d'une fiche.
 *
 * `init` sert au rendu serveur : un composant serveur n'a pas de cookies à
 * joindre automatiquement, il doit relayer la session lui-même pour que l'API
 * renvoie les champs personnalisés (`is_saved`, `is_read`).
 */
export async function fetchMicroArticle(
  slug: string,
  init?: RequestInit
): Promise<MicroArticleDetail> {
  return apiGet<MicroArticleDetail>(
    `/api/v1/content/microarticles/${encodeURIComponent(slug)}/`,
    init
  );
}

export async function fetchSavedMicroArticles(): Promise<MicroArticleListItem[]> {
  return apiGet<MicroArticleListItem[]>(`/api/v1/content/saved/`);
}

export async function saveMicroArticle(slug: string): Promise<{ saved: boolean }> {
  return apiJson<{ saved: boolean }>(`/api/v1/content/saved/`, jsonBody("POST", { slug }));
}

export async function unsaveMicroArticle(slug: string): Promise<void> {
  await apiJson<void>(`/api/v1/content/saved/${encodeURIComponent(slug)}/`, {
    method: "DELETE",
  });
}

/** Projection serveur de `LessonProgress.completed`, indexée par slug.
 *  Lecture seule : l'état « lu » s'écrit via le store de progression. */
export async function fetchMicroArticleReadStates(
  slugs: string[]
): Promise<{ items: Record<string, boolean> }> {
  const value = slugs
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join(",");
  return apiGet<{ items: Record<string, boolean> }>(
    `/api/v1/content/read-state/?slugs=${value}`
  );
}

export async function fetchLanding(): Promise<LandingPayload> {
  return apiGet<LandingPayload>("/api/v1/content/landing/");
}

/** Motifs des vignettes générées. Doublon assumé de `PatternName` côté UI :
 *  la couche API ne doit pas dépendre des composants. */
export type ThumbPattern =
  | "waves"
  | "chevrons"
  | "dots"
  | "vlines"
  | "diagonals"
  | "grid"
  | "crosshatch"
  | "rings"
  | "pluses"
  | "triangles";

export type ThumbOverridePublic = {
  pathology_slug: string;
  bg: string;
  accent: string;
  pattern: ThumbPattern;
};

export async function fetchThumbOverridesPublic(): Promise<ThumbOverridePublic[]> {
  return apiGet<ThumbOverridePublic[]>("/api/v1/content/thumb-overrides/");
}
