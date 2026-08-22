import { apiGet, apiJson, buildQuery, jsonBody } from "@/lib/api/client";
import type {
  LessonProgress,
  LessonProgressUpdate,
  SrsCounts,
  SrsNext,
  SrsRating,
  operations,
} from "@/lib/types";

export type SrsScope = NonNullable<
  NonNullable<operations["learning_srs_next"]["parameters"]["query"]>["scope"]
>;

export type SrsNextQuery = {
  scope: SrsScope;
  deck_id?: number | null;
  deck_ids?: number[];
  only_due?: boolean;
  /**
   * Cartes que la file doit sauter. La session y met celles qu'on a passées :
   * l'ordre de service étant déterministe, sans cela le serveur redonnerait
   * exactement la même carte. Rien n'est écrit côté serveur — c'est un réglage
   * de la requête, pas un état.
   */
  exclude_ids?: number[];
};

export async function fetchSrsNext(query: SrsNextQuery): Promise<SrsNext> {
  const deckIdsValue = query.deck_ids?.length ? query.deck_ids.join(",") : undefined;
  const excludeIdsValue = query.exclude_ids?.length ? query.exclude_ids.join(",") : undefined;

  return apiGet<SrsNext>(
    `/api/v1/learning/srs/next/${buildQuery({
      scope: query.scope,
      deck_id: query.deck_id != null ? String(query.deck_id) : undefined,
      deck_ids: deckIdsValue,
      only_due: query.only_due === false ? "false" : "true",
      exclude_ids: excludeIdsValue,
    })}`
  );
}

/**
 * Portée d'un comptage : les mêmes cartes que `fetchSrsNext`, sans `only_due`.
 * Les exclusions n'en font pas partie non plus — elles décrivent une session en
 * cours, pas la file, et le compteur doit rester celui de la file.
 */
export type SrsCountsQuery = Omit<SrsNextQuery, "only_due" | "exclude_ids">;

export async function fetchSrsCounts(query: SrsCountsQuery): Promise<SrsCounts> {
  const deckIdsValue = query.deck_ids?.length ? query.deck_ids.join(",") : undefined;

  return apiGet<SrsCounts>(
    `/api/v1/learning/srs/counts/${buildQuery({
      scope: query.scope,
      deck_id: query.deck_id != null ? String(query.deck_id) : undefined,
      deck_ids: deckIdsValue,
    })}`
  );
}

export async function postSrsReview(input: {
  card_id: number;
  rating: SrsRating;
}): Promise<SrsNext> {
  return apiJson<SrsNext>(`/api/v1/learning/srs/review/`, jsonBody("POST", input));
}

// -----------------------------------------------------------------------------
// Progression des leçons (miroir serveur du store local)
// -----------------------------------------------------------------------------

export async function fetchLessonProgress(): Promise<LessonProgress[]> {
  return apiGet<LessonProgress[]>("/api/v1/learning/progress/");
}

export async function patchLessonProgress(
  lessonId: number,
  input: LessonProgressUpdate
): Promise<LessonProgress> {
  return apiJson<LessonProgress>(
    `/api/v1/learning/progress/${encodeURIComponent(String(lessonId))}/`,
    jsonBody("PATCH", input)
  );
}

export async function importLessonProgress(input: {
  device_id?: string;
  lessons: Record<string, LessonProgressUpdate>;
}): Promise<{ imported: number; updated: number }> {
  return apiJson<{ imported: number; updated: number }>(
    "/api/v1/learning/progress/import/",
    jsonBody("POST", input)
  );
}
