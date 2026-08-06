import { apiGet, apiJson, jsonBody } from "@/lib/api/client";
import type { LandingPayload, MicroArticleDetail, MicroArticleListItem } from "@/lib/types";

export async function fetchMicroArticle(slug: string): Promise<MicroArticleDetail> {
  return apiGet<MicroArticleDetail>(
    `/api/v1/content/microarticles/${encodeURIComponent(slug)}/`
  );
}

export async function fetchSavedMicroArticles(): Promise<MicroArticleListItem[]> {
  return apiGet<MicroArticleListItem[]>(`/api/v1/content/saved/`);
}

export async function saveMicroArticle(slug: string): Promise<{ saved: boolean }> {
  return apiJson<{ saved: boolean }>(`/api/v1/content/saved/`, jsonBody("POST", { slug }));
}

export async function fetchMicroArticleSavedStatus(slug: string): Promise<{ saved: boolean }> {
  return apiGet<{ saved: boolean }>(`/api/v1/content/saved/${encodeURIComponent(slug)}/`);
}

export async function unsaveMicroArticle(slug: string): Promise<void> {
  await apiJson<void>(`/api/v1/content/saved/${encodeURIComponent(slug)}/`, {
    method: "DELETE",
  });
}

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

export async function setMicroArticleReadState(
  slug: string,
  is_read: boolean
): Promise<{ slug: string; is_read: boolean }> {
  return apiJson<{ slug: string; is_read: boolean }>(
    `/api/v1/content/read-state/`,
    jsonBody("POST", { slug, is_read })
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
