import { apiGet, apiJson, jsonBody } from "@/lib/api/client";

export type SubjectListItem = {
  id: number;
  name: string;
  slug: string;
  description: string;
  cards_count: number;
  has_recap: boolean;
};

export type SubjectDetail = {
  id: number;
  name: string;
  slug: string;
  description: string;
  detail_cards: Array<{
    id: number;
    slug: string;
    title: string;
    label: string;
    sort_order: number;
  }>;
  recap_card: {
    id: number;
    slug: string;
    title: string;
  } | null;
};

export type SubjectCardItem = {
  id: number;
  microarticle_id: number;
  slug: string;
  title: string;
  card_type: string;
  label: string;
  sort_order: number;
};

function subjectPath(slug: string, suffix = ""): string {
  return `/api/v1/content/subjects/${encodeURIComponent(slug)}/${suffix}`;
}

export async function fetchSubjects(q?: string): Promise<SubjectListItem[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiGet<SubjectListItem[]>(`/api/v1/content/subjects/${qs}`);
}

export async function fetchSubject(slug: string): Promise<SubjectDetail> {
  return apiGet<SubjectDetail>(subjectPath(slug));
}

export async function createSubject(input: {
  name: string;
  slug?: string;
  description?: string;
}): Promise<{ id: number; name: string; slug: string; description: string }> {
  return apiJson(`/api/v1/content/subjects/`, jsonBody("POST", input));
}

export async function patchSubject(
  slug: string,
  input: Partial<{ name: string; slug: string; description: string }>
): Promise<{ id: number; name: string; slug: string; description: string }> {
  return apiJson(subjectPath(slug), jsonBody("PATCH", input));
}

export async function deleteSubject(slug: string): Promise<void> {
  await apiJson(subjectPath(slug), { method: "DELETE" });
}

export async function fetchSubjectCards(slug: string): Promise<SubjectCardItem[]> {
  return apiGet<SubjectCardItem[]>(subjectPath(slug, "cards/"));
}

export async function addCardToSubject(
  subjectSlug: string,
  cardSlug: string,
  label?: string
): Promise<SubjectCardItem> {
  return apiJson(
    subjectPath(subjectSlug, "cards/"),
    jsonBody("POST", { card_slug: cardSlug, label: label || "" })
  );
}

export async function patchSubjectCard(
  subjectSlug: string,
  cardId: number,
  input: Partial<{ label: string; sort_order: number }>
): Promise<{ id: number; microarticle_id: number; label: string; sort_order: number }> {
  return apiJson(subjectPath(subjectSlug, `cards/${cardId}/`), jsonBody("PATCH", input));
}

export async function removeCardFromSubject(subjectSlug: string, cardId: number): Promise<void> {
  await apiJson(subjectPath(subjectSlug, `cards/${cardId}/`), { method: "DELETE" });
}

export async function reorderSubjectCards(
  subjectSlug: string,
  cardIds: number[]
): Promise<{ ok: boolean }> {
  return apiJson(subjectPath(subjectSlug, "cards/reorder/"), jsonBody("POST", { order: cardIds }));
}
