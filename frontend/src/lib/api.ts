import {
  AdminMicroArticleSearchResult,
  AdminPackDetail,
  AdminPackSummary,
  CursorPage,
  DeckCardsResponse,
  DeckMembership,
  DeckSummary,
  LandingPayload,
  LessonProgress,
  LessonProgressUpdate,
  MicroArticleDetail,
  MicroArticleListItem,
  SrsNextResponse,
  SrsRating,
  SrsScope,
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
  title: string;
  answer_express: string;
  takeaway: string;
  key_points: string[];
  cover_image_url: string | null;
  tags: Array<{ id: number; name: string; slug: string }>;
  categories_theme: Array<{ id: number; name: string; slug: string }>;
  categories_maladies: Array<{ id: number; name: string; slug: string }>;
  categories_medicament: Array<{ id: number; name: string; slug: string }>;
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

export async function fetchMicroArticle(slug: string): Promise<MicroArticleDetail> {
  return apiGet<MicroArticleDetail>(
    `/api/v1/content/microarticles/${encodeURIComponent(slug)}/`
  );
}

export async function fetchSavedMicroArticles(): Promise<MicroArticleListItem[]> {
  return apiGet<MicroArticleListItem[]>(`/api/v1/content/saved/`);
}

export async function fetchDecks(): Promise<DeckSummary[]> {
  return apiGet<DeckSummary[]>(`/api/v1/content/decks/`);
}

export async function createDeck(name: string): Promise<{ id: number; name: string; is_default: boolean; sort_order: number }> {
  return apiJson<{ id: number; name: string; is_default: boolean; sort_order: number }>(
    `/api/v1/content/decks/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }
  );
}

export async function patchDeck(
  deckId: number,
  input: { name?: string; sort_order?: number }
): Promise<{ id: number; name: string; is_default: boolean; sort_order: number }> {
  return apiJson<{ id: number; name: string; is_default: boolean; sort_order: number }>(
    `/api/v1/content/decks/${encodeURIComponent(String(deckId))}/`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteDeck(deckId: number): Promise<void> {
  await apiJson<void>(`/api/v1/content/decks/${encodeURIComponent(String(deckId))}/`, {
    method: "DELETE",
  });
}

export async function setDefaultDeck(deckId: number): Promise<{ ok: boolean; default_deck_id: number }> {
  return apiJson<{ ok: boolean; default_deck_id: number }>(
    `/api/v1/content/decks/${encodeURIComponent(String(deckId))}/set-default/`,
    { method: "POST" }
  );
}

export async function fetchDeckCards(deckId: number, search?: string): Promise<DeckCardsResponse> {
  const qs = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<DeckCardsResponse>(
    `/api/v1/content/decks/${encodeURIComponent(String(deckId))}/cards/${qs}`
  );
}

export async function addCardToDeck(deckId: number, cardId: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(
    `/api/v1/content/decks/${encodeURIComponent(String(deckId))}/cards/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ card_id: cardId }),
    }
  );
}

export async function removeCardFromDeck(deckId: number, cardId: number): Promise<void> {
  await apiJson<void>(
    `/api/v1/content/decks/${encodeURIComponent(String(deckId))}/cards/${encodeURIComponent(
      String(cardId)
    )}/`,
    { method: "DELETE" }
  );
}

export async function fetchCardDecks(cardId: number): Promise<DeckMembership[]> {
  return apiGet<DeckMembership[]>(
    `/api/v1/content/cards/${encodeURIComponent(String(cardId))}/decks/`
  );
}

export async function updateCardDecks(cardId: number, deckIds: number[]): Promise<{ ok: boolean; deck_ids: number[] }> {
  return apiJson<{ ok: boolean; deck_ids: number[] }>(
    `/api/v1/content/cards/${encodeURIComponent(String(cardId))}/decks/`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deck_ids: deckIds }),
    }
  );
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
  return apiJson<{ slug: string; is_read: boolean }>(`/api/v1/content/read-state/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slug, is_read }),
  });
}

export async function fetchTaxonomyTree(
  taxonomy: "pharmacologie" | "maladies" | "classes" | "theme" | "medicament"
): Promise<TaxonomyTreeResponse> {
  return apiGet<TaxonomyTreeResponse>(`/api/v1/taxonomies/${taxonomy}/tree/`);
}

export async function fetchTags(q?: string, limit = 200): Promise<TagPayload[]> {
  return apiGet<TagPayload[]>(
    `/api/v1/tags/${buildQuery({ q: q?.trim() ? q.trim() : undefined, limit: String(limit) })}`
  );
}

export type SrsNextQuery = {
  scope: SrsScope;
  deck_id?: number | null;
  deck_ids?: number[];
  only_due?: boolean;
};

export async function fetchSrsNext(query: SrsNextQuery): Promise<SrsNextResponse> {
  const deckIdsValue = query.deck_ids?.length ? query.deck_ids.join(",") : undefined;

  return apiGet<SrsNextResponse>(
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
}): Promise<SrsNextResponse> {
  return apiJson<SrsNextResponse>(`/api/v1/learning/srs/review/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchLessonProgress(): Promise<LessonProgress[]> {
  return apiGet<LessonProgress[]>("/api/v1/learning/progress/");
}

export async function patchLessonProgress(
  lessonId: number,
  input: LessonProgressUpdate
): Promise<LessonProgress> {
  return apiJson<LessonProgress>(
    `/api/v1/learning/progress/${encodeURIComponent(String(lessonId))}/`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );
}

export async function importLessonProgress(input: {
  device_id?: string;
  lessons: Record<string, LessonProgressUpdate>;
}): Promise<{ imported: number; updated: number }> {
  return apiJson<{ imported: number; updated: number }>(
    "/api/v1/learning/progress/import/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );
}

export type CurrentUser = {
  id: number;
  email: string;
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
  landing_redirect_enabled?: boolean;
  landing_redirect_target?: "start" | "discover" | "cards" | "review" | "quiz";
};

export async function fetchMe(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/v1/auth/me/");
}

export type LandingRedirectTarget = "start" | "discover" | "cards" | "review" | "quiz";

export type UserPreferences = {
  landing_redirect_enabled: boolean;
  landing_redirect_target: LandingRedirectTarget;
};

export async function fetchPreferences(): Promise<UserPreferences> {
  return apiGet<UserPreferences>("/api/v1/auth/preferences/");
}

export async function patchPreferences(input: Partial<UserPreferences>): Promise<UserPreferences> {
  return apiJson<UserPreferences>("/api/v1/auth/preferences/", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchLanding(): Promise<LandingPayload> {
  return apiGet<LandingPayload>("/api/v1/content/landing/");
}

export async function fetchAdminPacks(): Promise<AdminPackSummary[]> {
  return apiGet<AdminPackSummary[]>("/api/v1/content/admin/packs/");
}

export async function createAdminPack(input: {
  name: string;
  description?: string;
  difficulty?: string;
  estimated_minutes?: number | null;
  status?: string;
  sort_order?: number;
  cover_image_id?: number | null;
}): Promise<AdminPackSummary> {
  return apiJson<AdminPackSummary>("/api/v1/content/admin/packs/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchAdminPack(packId: number): Promise<AdminPackDetail> {
  return apiGet<AdminPackDetail>(`/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/`);
}

export async function patchAdminPack(
  packId: number,
  input: Partial<{
    name: string;
    description: string;
    difficulty: string;
    estimated_minutes: number | null;
    status: string;
    sort_order: number;
    cover_image_id: number | null;
  }>
): Promise<AdminPackSummary> {
  return apiJson<AdminPackSummary>(`/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function deleteAdminPack(packId: number): Promise<void> {
  await apiJson(`/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/`, {
    method: "DELETE",
  });
}

export async function adminMicroArticleSearch(input: {
  q?: string;
  tags?: string[];
  theme_nodes?: number[];
  theme_scope?: "exact" | "subtree";
  medicament_nodes?: number[];
  medicament_scope?: "exact" | "subtree";
  pharmacologie_nodes?: number[];
  pharmacologie_scope?: "exact" | "subtree";
}): Promise<AdminMicroArticleSearchResult[]> {
  const usp = new URLSearchParams();
  const q = (input.q ?? "").trim();
  if (q) usp.set("q", q);

  if (input.tags?.length) usp.set("tags", input.tags.join(","));

  if (input.theme_nodes?.length) usp.set("theme_nodes", input.theme_nodes.join(","));
  if (input.theme_scope) usp.set("theme_scope", input.theme_scope);

  if (input.medicament_nodes?.length) usp.set("medicament_nodes", input.medicament_nodes.join(","));
  if (input.medicament_scope) usp.set("medicament_scope", input.medicament_scope);

  if (input.pharmacologie_nodes?.length)
    usp.set("pharmacologie_nodes", input.pharmacologie_nodes.join(","));
  if (input.pharmacologie_scope) usp.set("pharmacologie_scope", input.pharmacologie_scope);

  const qs = usp.toString();
  if (!qs) return [];
  return apiGet<AdminMicroArticleSearchResult[]>(`/api/v1/content/admin/microarticles/search/?${qs}`);
}

export async function adminUploadImage(input: {
  file: File;
  title?: string;
}): Promise<{ id: number; url: string | null; title: string }> {
  const fd = new FormData();
  fd.append("file", input.file);
  if (input.title) fd.append("title", input.title);

  const res = await apiFetch("/api/v1/content/admin/images/upload/", {
    method: "POST",
    body: fd,
  });

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
      `API ${res.status} on /api/v1/content/admin/images/upload/ (content-type: ${
        contentType || "unknown"
      }): ${JSON.stringify(parsed)}`
    );
  }

  return (await res.json()) as { id: number; url: string | null; title: string };
}

export async function adminPackBulkAdd(
  packId: number,
  input:
    | { items: string }
    | { microarticle_ids: number[] }
    | { slugs: string[] }
): Promise<{ added: number; already_present: number; not_found: number }> {
  return apiJson<{ added: number; already_present: number; not_found: number }>(
    `/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/bulk-add/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );
}

export async function adminPackReorder(
  packId: number,
  microarticleIds: number[]
): Promise<{ ok: boolean; updated: number }> {
  return apiJson<{ ok: boolean; updated: number }>(
    `/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/cards/reorder/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ microarticle_ids: microarticleIds }),
    }
  );
}

export async function adminPackRemoveCard(packId: number, cardId: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(
    `/api/v1/content/admin/packs/${encodeURIComponent(String(packId))}/cards/${encodeURIComponent(
      String(cardId)
    )}/remove/`,
    {
      method: "POST",
    }
  );
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
