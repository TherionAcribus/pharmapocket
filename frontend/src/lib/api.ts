import {
  CursorPage,
  MicroArticleDetail,
  MicroArticleListItem,
  TagPayload,
  TaxonomyTreeResponse,
} from "@/lib/types";

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const fallback = "http://localhost:8000";

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

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

const CSRF_COOKIE_NAME = "csrftoken";

async function ensureCsrfCookie(): Promise<void> {
  if (typeof window === "undefined") return;
  if (getCookie(CSRF_COOKIE_NAME)) return;
  await fetch(`${getApiBaseUrl()}/api/v1/auth/csrf/`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
}

function isMutatingMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && m !== "TRACE";
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getApiBaseUrl()}${path}`;
  const method = init?.method ?? "GET";

  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (typeof window !== "undefined" && isMutatingMethod(method)) {
    await ensureCsrfCookie();
    const csrf = getCookie(CSRF_COOKIE_NAME);
    if (csrf && !headers.has("X-CSRFToken")) {
      headers.set("X-CSRFToken", csrf);
    }
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let parsed: unknown = raw;
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    throw new Error(
      `API ${res.status} on ${path} (content-type: ${contentType || "unknown"}): ${JSON.stringify(parsed)}`
    );
  }

  return (await res.json()) as T;
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let parsed: unknown = raw;
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    throw new Error(
      `API ${res.status} on ${path} (content-type: ${contentType || "unknown"}): ${JSON.stringify(parsed)}`
    );
  }

  if (res.status === 204) return undefined as T;
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

type FeedItemPayload = {
  id: number;
  slug: string;
  title_question: string;
  answer_express: string;
  takeaway: string;
  key_points: string[];
  cover_image_url: string | null;
  tags: Array<{ id: number; name: string; slug: string }>;
  categories_pharmacologie: Array<{ id: number; name: string; slug: string }>;
  categories_maladies: Array<{ id: number; name: string; slug: string }>;
  categories_classes: Array<{ id: number; name: string; slug: string }>;
  published_at?: string | null;
  progress?: unknown;
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

export async function fetchDiscoverFeed(query: FeedQuery): Promise<CursorPage<MicroArticleListItem>> {
  const tagsValue = query.tags?.length ? query.tags.join(",") : undefined;

  const page = await apiGet<CursorPage<FeedItemPayload>>(
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
      title_question: r.title_question,
      answer_express: r.answer_express,
      takeaway: r.takeaway,
      key_points: r.key_points,
      cover_image_url: r.cover_image_url,
      tags: r.tags.map((t) => t.name),
      tags_payload: r.tags,
      categories_pharmacologie_payload: r.categories_pharmacologie,
      categories_maladies_payload: r.categories_maladies,
      categories_classes_payload: r.categories_classes,
      published_at: r.published_at ?? null,
    })),
  };
}

export async function fetchMicroArticle(slug: string): Promise<MicroArticleDetail> {
  return apiGet<MicroArticleDetail>(
    `/api/v1/content/microarticles/${encodeURIComponent(slug)}/`
  );
}

export async function fetchSavedMicroArticles(): Promise<MicroArticleListItem[]> {
  return apiGet<MicroArticleListItem[]>(`/api/v1/content/saved/`);
}

export async function saveMicroArticle(slug: string): Promise<{ saved: boolean }> {
  return apiJson<{ saved: boolean }>(`/api/v1/content/saved/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slug }),
  });
}

export async function fetchMicroArticleSavedStatus(
  slug: string
): Promise<{ saved: boolean }> {
  return apiGet<{ saved: boolean }>(`/api/v1/content/saved/${encodeURIComponent(slug)}/`);
}

export async function unsaveMicroArticle(slug: string): Promise<void> {
  await apiJson<void>(`/api/v1/content/saved/${encodeURIComponent(slug)}/`, {
    method: "DELETE",
  });
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

export type CurrentUser = {
  id: number;
  email: string;
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
};

export async function fetchMe(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/v1/auth/me/");
}

const ALLAUTH_CLIENT = "browser";

export async function authLogin(input: {
  email: string;
  password: string;
}): Promise<unknown> {
  return apiJson(`/auth/${ALLAUTH_CLIENT}/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
}

export async function authSignup(input: {
  email: string;
  password: string;
}): Promise<unknown> {
  return apiJson(`/auth/${ALLAUTH_CLIENT}/v1/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
}

export async function authLogout(): Promise<void> {
  await apiJson(`/auth/${ALLAUTH_CLIENT}/v1/auth/session`, {
    method: "DELETE",
  });
}

export async function authVerifyEmail(key: string): Promise<unknown> {
  return apiJson(`/auth/${ALLAUTH_CLIENT}/v1/auth/email/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key }),
  });
}

export async function ensureCsrf(): Promise<void> {
  await ensureCsrfCookie();
}
