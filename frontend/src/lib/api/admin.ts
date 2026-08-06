import { apiGet, apiJson, jsonBody } from "@/lib/api/client";
import type { ThumbPattern } from "@/lib/api/content";
import type {
  AdminMicroArticleSearchResult,
  AdminPackDetail,
  AdminPackSummary,
} from "@/lib/types";

function adminPackPath(packId: number, suffix = ""): string {
  return `/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/${suffix}`;
}

// -----------------------------------------------------------------------------
// Packs officiels
// -----------------------------------------------------------------------------

export type AdminPackInput = {
  name: string;
  description: string;
  difficulty: string;
  estimated_minutes: number | null;
  status: string;
  sort_order: number;
  cover_image_id: number | null;
};

export async function fetchAdminPacks(): Promise<AdminPackSummary[]> {
  return apiGet<AdminPackSummary[]>("/api/v1/content/admin/packs/");
}

export async function fetchAdminPack(packId: number): Promise<AdminPackDetail> {
  return apiGet<AdminPackDetail>(adminPackPath(packId));
}

export async function createAdminPack(
  input: Pick<AdminPackInput, "name"> & Partial<AdminPackInput>
): Promise<AdminPackSummary> {
  return apiJson<AdminPackSummary>("/api/v1/content/admin/packs/", jsonBody("POST", input));
}

export async function patchAdminPack(
  packId: number,
  input: Partial<AdminPackInput>
): Promise<AdminPackSummary> {
  return apiJson<AdminPackSummary>(adminPackPath(packId), jsonBody("PATCH", input));
}

export async function deleteAdminPack(packId: number): Promise<void> {
  await apiJson(adminPackPath(packId), { method: "DELETE" });
}

export async function adminPackBulkAdd(
  packId: number,
  input: { items: string } | { microarticle_ids: number[] } | { slugs: string[] }
): Promise<{ added: number; already_present: number; not_found: number }> {
  return apiJson<{ added: number; already_present: number; not_found: number }>(
    adminPackPath(packId, "bulk-add/"),
    jsonBody("POST", input)
  );
}

export async function adminPackReorder(
  packId: number,
  microarticleIds: number[]
): Promise<{ ok: boolean; updated: number }> {
  return apiJson<{ ok: boolean; updated: number }>(
    adminPackPath(packId, "cards/reorder/"),
    jsonBody("POST", { microarticle_ids: microarticleIds })
  );
}

export async function adminPackRemoveCard(
  packId: number,
  cardId: number
): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(
    adminPackPath(packId, `cards/${encodeURIComponent(String(cardId))}/remove/`),
    { method: "POST" }
  );
}

// -----------------------------------------------------------------------------
// Recherche de micro-articles (composeur de packs)
// -----------------------------------------------------------------------------

export type AdminMicroArticleSearchQuery = {
  q?: string;
  recent?: boolean;
  tags?: string[];
  theme_nodes?: number[];
  theme_scope?: "exact" | "subtree";
  maladies_nodes?: number[];
  maladies_scope?: "exact" | "subtree";
  medicament_nodes?: number[];
  medicament_scope?: "exact" | "subtree";
  pharmacologie_nodes?: number[];
  pharmacologie_scope?: "exact" | "subtree";
};

export async function adminMicroArticleSearch(
  input: AdminMicroArticleSearchQuery
): Promise<AdminMicroArticleSearchResult[]> {
  const usp = new URLSearchParams();
  const q = (input.q ?? "").trim();
  if (q) usp.set("q", q);

  if (input.recent) usp.set("recent", "1");

  if (input.tags?.length) usp.set("tags", input.tags.join(","));

  if (input.theme_nodes?.length) usp.set("theme_nodes", input.theme_nodes.join(","));
  if (input.theme_scope) usp.set("theme_scope", input.theme_scope);

  if (input.maladies_nodes?.length) usp.set("maladies_nodes", input.maladies_nodes.join(","));
  if (input.maladies_scope) usp.set("maladies_scope", input.maladies_scope);

  if (input.medicament_nodes?.length) usp.set("medicament_nodes", input.medicament_nodes.join(","));
  if (input.medicament_scope) usp.set("medicament_scope", input.medicament_scope);

  if (input.pharmacologie_nodes?.length)
    usp.set("pharmacologie_nodes", input.pharmacologie_nodes.join(","));
  if (input.pharmacologie_scope) usp.set("pharmacologie_scope", input.pharmacologie_scope);

  const qs = usp.toString();
  if (!qs) return [];
  return apiGet<AdminMicroArticleSearchResult[]>(
    `/api/v1/content/admin/microarticles/search/?${qs}`
  );
}

export async function adminUploadImage(input: {
  file: File;
  title?: string;
}): Promise<{ id: number; url: string | null; title: string }> {
  const fd = new FormData();
  fd.append("file", input.file);
  if (input.title) fd.append("title", input.title);

  // FormData : pas de Content-Type explicite, le navigateur pose la boundary.
  return apiJson<{ id: number; url: string | null; title: string }>(
    "/api/v1/content/admin/images/upload/",
    { method: "POST", body: fd }
  );
}

// -----------------------------------------------------------------------------
// Vignettes personnalisées
// -----------------------------------------------------------------------------

export type AdminThumbOverride = {
  id: number;
  pathology_slug: string;
  bg: string;
  accent: string;
  pattern: ThumbPattern;
  updated_at?: string;
};

export type AdminThumbOverrideInput = {
  pathology_slug: string;
  bg: string;
  accent: string;
  pattern: ThumbPattern;
};

function adminThumbOverridePath(pathologySlug: string): string {
  return `/api/v1/content/admin/thumb-overrides/${encodeURIComponent(pathologySlug)}/`;
}

export async function fetchAdminThumbOverrides(): Promise<AdminThumbOverride[]> {
  return apiGet<AdminThumbOverride[]>("/api/v1/content/admin/thumb-overrides/");
}

export async function createAdminThumbOverride(
  input: AdminThumbOverrideInput
): Promise<AdminThumbOverride> {
  return apiJson<AdminThumbOverride>(
    "/api/v1/content/admin/thumb-overrides/",
    jsonBody("POST", input)
  );
}

export async function patchAdminThumbOverride(
  pathologySlug: string,
  input: Partial<AdminThumbOverrideInput>
): Promise<AdminThumbOverride> {
  return apiJson<AdminThumbOverride>(
    adminThumbOverridePath(pathologySlug),
    jsonBody("PATCH", input)
  );
}

export async function deleteAdminThumbOverride(pathologySlug: string): Promise<void> {
  await apiJson<void>(adminThumbOverridePath(pathologySlug), { method: "DELETE" });
}
