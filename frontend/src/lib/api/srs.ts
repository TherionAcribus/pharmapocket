import { apiGet, apiJson, buildQuery, jsonBody } from "@/lib/api/client";
import type {
  LessonProgress,
  LessonProgressUpdate,
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
};

export async function fetchSrsNext(query: SrsNextQuery): Promise<SrsNext> {
  const deckIdsValue = query.deck_ids?.length ? query.deck_ids.join(",") : undefined;

  return apiGet<SrsNext>(
    `/api/v1/learning/srs/next/${buildQuery({
      scope: query.scope,
      deck_id: query.deck_id != null ? String(query.deck_id) : undefined,
      deck_ids: deckIdsValue,
      only_due: query.only_due === false ? "false" : "true",
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
