import { apiGet, buildQuery } from "@/lib/api/client";
import type { TagPayload, TaxonomyTreeResponse } from "@/lib/types";

export type TaxonomyName = "pharmacologie" | "maladies" | "classes" | "theme" | "medicament";

export async function fetchTaxonomyTree(taxonomy: TaxonomyName): Promise<TaxonomyTreeResponse> {
  return apiGet<TaxonomyTreeResponse>(`/api/v1/taxonomies/${taxonomy}/tree/`);
}

export async function fetchTags(q?: string, limit = 200): Promise<TagPayload[]> {
  return apiGet<TagPayload[]>(
    `/api/v1/tags/${buildQuery({ q: q?.trim() ? q.trim() : undefined, limit: String(limit) })}`
  );
}
