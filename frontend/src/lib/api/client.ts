/**
 * Transport commun à tous les modules `lib/api/*`.
 *
 * Seul endroit qui connaît l'URL de base, le cookie CSRF et la forme des
 * erreurs : les modules de domaine n'écrivent que des chemins et des types.
 */

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

export async function ensureCsrfCookie(): Promise<void> {
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
    // `no-store` par défaut : la quasi-totalité des lectures dépendent de la
    // session (`is_saved`, `is_read`, decks…) et ne doivent jamais être servies
    // au visiteur suivant. Un appelant peut demander explicitement une autre
    // politique pour une ressource publique et partageable — c'est le cas du
    // préchargement serveur des overrides de vignettes.
    cache: init?.cache ?? "no-store",
  });
}

function formatRetryDelay(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} secondes`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "une minute" : `${minutes} minutes`;
}

/**
 * Erreur HTTP renvoyée par l'API.
 *
 * `status` et `body` permettent aux pages de brancher proprement (401, 403,
 * 404…) au lieu de fouiller le texte du message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly path: string;

  constructor(message: string, init: { status: number; body: unknown; path: string }) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.body = init.body;
    this.path = init.path;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

async function buildApiError(res: Response, path: string): Promise<ApiError> {
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let body: unknown = raw;
  if (contentType.includes("application/json")) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (res.status === 429) {
    // L'API limite le débit : le détail technique n'apprend rien à l'utilisateur.
    // `Retry-After` n'est lisible que parce que le backend l'expose via CORS.
    const retryAfter = Number(res.headers.get("Retry-After"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? `Réessayez dans ${formatRetryDelay(retryAfter)}.`
        : "Réessayez dans quelques instants.";
    return new ApiError(`Trop de tentatives. ${delay}`, { status: res.status, body, path });
  }

  return new ApiError(
    `API ${res.status} on ${path} (content-type: ${contentType || "unknown"}): ${JSON.stringify(body)}`,
    { status: res.status, body, path }
  );
}

/**
 * Point de passage unique des réponses : lève une `ApiError` si le statut n'est
 * pas 2xx, et décode le JSON sinon (204 -> `undefined`).
 */
async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    throw await buildApiError(res, path);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return handleResponse<T>(await apiFetch(path, init), path);
}

export async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  return handleResponse<T>(await apiFetch(path, init), path);
}

export async function apiPostOkOr401(path: string, payload: unknown): Promise<void> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // 401 est attendu ici : l'API renvoie ce statut quand l'utilisateur n'est pas
  // (encore) authentifié, ce qui n'est pas une erreur pour ces flux.
  if (res.status === 200 || res.status === 401) {
    return;
  }

  throw await buildApiError(res, path);
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, v);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

/** Raccourci pour les corps JSON, qui représentent la quasi-totalité des écritures. */
export function jsonBody(method: "POST" | "PATCH" | "PUT" | "DELETE", payload: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}
