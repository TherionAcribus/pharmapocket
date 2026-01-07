import {
  CursorPage,
  MicroArticleDetail,
  MicroArticleListItem,
  TagPayload,
  TaxonomyTreeResponse,
} from "@/lib/types";

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const fallback = "http://127.0.0.1:8000";

  const raw = (base && base.trim()) || (process.env.NODE_ENV !== "production" ? fallback : "");
  if (!raw) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  }

  // On Windows, `localhost` can resolve to IPv6 (::1). Django's devserver often
  // listens on 127.0.0.1, which makes server-side fetches fail without any Django log.
  // Only normalize on the server to avoid surprising browser behavior.
  const normalized = typeof window === "undefined" ? raw.replace("//localhost", "//127.0.0.1") : raw;

  return normalized.replace(/\/$/, "");
}

async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new Error(`API ${res.status} on ${path}: ${JSON.stringify(body)}`);
  }

  return (await res.json()) as T;
}

export type FeedQuery = {
  cursor?: string | null;
  q?: string | null;
  tags?: string[];
  taxonomy?: "pharmacologie" | "maladies" | "classes";
  node?: number | null;
  scope?: "exact" | "subtree";
};

function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, v);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchFeed(query: FeedQuery): Promise<CursorPage<MicroArticleListItem>> {
  const tagsValue = query.tags?.length ? query.tags.join(",") : undefined;

  return apiGet<CursorPage<MicroArticleListItem>>(
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

export async function fetchMicroArticle(slug: string): Promise<MicroArticleDetail> {
  return apiGet<MicroArticleDetail>(
    `/api/v1/content/microarticles/${encodeURIComponent(slug)}/`
  );
}

export async function fetchTaxonomyTree(
  taxonomy: "pharmacologie" | "maladies" | "classes"
): Promise<TaxonomyTreeResponse> {
  return apiGet<TaxonomyTreeResponse>(`/api/v1/taxonomies/${taxonomy}/tree/`);
}

export async function fetchTags(q?: string, limit = 200): Promise<TagPayload[]> {
  return apiGet<TagPayload[]>(
    `/api/v1/tags/${buildQuery({ q: q?.trim() ? q.trim() : undefined, limit: String(limit) })}`
  );
}
