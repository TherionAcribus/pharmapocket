import { apiGet, buildQuery } from "@/lib/api/client";
import type {
  PaginatedFeedItemList,
  PaginatedMicroArticleListItemList,
} from "@/lib/types";

export type FeedQuery = {
  cursor?: string | null;
  q?: string | null;
  tags?: string[];
  taxonomy?: "pharmacologie" | "maladies" | "classes";
  node?: number | null;
  scope?: "exact" | "subtree";
};

export async function fetchFeed(query: FeedQuery): Promise<PaginatedMicroArticleListItemList> {
  const tagsValue = query.tags?.length ? query.tags.join(",") : undefined;

  return apiGet<PaginatedMicroArticleListItemList>(
    `/api/v1/content/microarticles/${buildQuery({
      cursor: query.cursor ?? undefined,
      q: query.q ?? undefined,
      tags: tagsValue,
      taxonomy: query.taxonomy,
      node: query.node != null ? String(query.node) : undefined,
      scope: query.scope,
    })}`
  );
}

export async function fetchDiscoverFeed(
  query: FeedQuery
): Promise<PaginatedMicroArticleListItemList> {
  const tagsValue = query.tags?.length ? query.tags.join(",") : undefined;

  const page = await apiGet<PaginatedFeedItemList>(
    `/api/v1/feed/${buildQuery({
      cursor: query.cursor ?? undefined,
      q: query.q ?? undefined,
      tags: tagsValue,
      taxonomy: query.taxonomy,
      category: query.node != null ? String(query.node) : undefined,
      scope: query.scope,
    })}`
  );

  return {
    next: page.next,
    previous: page.previous,
    results: page.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      answer_express: r.answer_express,
      takeaway: r.takeaway,
      key_points: r.key_points,
      cover_image_url: r.cover_image_url,
      tags: r.tags.map((t) => t.name),
      tags_payload: r.tags,
      categories_theme_payload: r.categories_theme,
      categories_maladies_payload: r.categories_maladies,
      categories_medicament_payload: r.categories_medicament,
      published_at: r.published_at ?? null,
    })),
  };
}
