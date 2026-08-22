import {
  apiGet,
  apiJson,
  apiPostOkOr401,
  ensureCsrfCookie,
  getApiBaseUrl,
  getCsrfToken,
  jsonBody,
} from "@/lib/api/client";
import type {
  AccountSummary,
  CurrentUser,
  LandingRedirectTargetEnum,
  UserPreferences,
} from "@/lib/types";

export type { AccountSummary, CurrentUser, UserPreferences } from "@/lib/types";
export type LandingRedirectTarget = LandingRedirectTargetEnum;

/**
 * Pose le cookie CSRF s'il manque.
 *
 * Inutile avant un appel passant par `apiFetch` : le transport l'appelle déjà
 * pour toute méthode mutante. À réserver aux envois qui en sortent — le POST
 * de formulaire natif de la redirection OAuth, notamment.
 */
export async function ensureCsrf(): Promise<void> {
  await ensureCsrfCookie();
}

// -----------------------------------------------------------------------------
// Session et compte (API maison)
// -----------------------------------------------------------------------------

export async function fetchMe(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/v1/auth/me/");
}

export async function fetchAccount(): Promise<AccountSummary> {
  return apiGet<AccountSummary>("/api/v1/auth/account/");
}

export async function patchAccount(input: Partial<{ pseudo: string }>): Promise<AccountSummary> {
  return apiJson<AccountSummary>("/api/v1/auth/account/", jsonBody("PATCH", input));
}

export async function deleteAccount(input?: { password?: string }): Promise<void> {
  await apiJson(
    "/api/v1/auth/account/delete/",
    jsonBody("POST", { password: input?.password ?? "" })
  );
}

export async function fetchPreferences(): Promise<UserPreferences> {
  return apiGet<UserPreferences>("/api/v1/auth/preferences/");
}

export async function patchPreferences(
  input: Partial<UserPreferences>
): Promise<UserPreferences> {
  return apiJson<UserPreferences>("/api/v1/auth/preferences/", jsonBody("PATCH", input));
}

// -----------------------------------------------------------------------------
// Flux allauth headless
// -----------------------------------------------------------------------------

const ALLAUTH_CLIENT = "browser";

export async function authLogin(input: {
  identifier: string;
  password: string;
}): Promise<unknown> {
  const identifier = (input.identifier ?? "").trim();
  const looksLikeEmail = identifier.includes("@");

  return apiJson(
    `/auth/${ALLAUTH_CLIENT}/v1/auth/login`,
    jsonBody(
      "POST",
      looksLikeEmail
        ? { email: identifier, password: input.password }
        : { username: identifier, password: input.password }
    )
  );
}

export async function authSignup(input: {
  email: string;
  username: string;
  password: string;
}): Promise<unknown> {
  return apiJson(
    `/auth/${ALLAUTH_CLIENT}/v1/auth/signup`,
    jsonBody("POST", {
      email: input.email,
      username: input.username,
      password: input.password,
    })
  );
}

/**
 * Envoie le navigateur chez un fournisseur OAuth via allauth.
 *
 * Seul flux d'auth qui ne passe pas par `apiFetch` : allauth attend ici un POST
 * de formulaire classique, parce que la réponse est une redirection que le
 * navigateur doit suivre lui-même (un `fetch` la consommerait). D'où le
 * `<form>` construit à la main, et le jeton CSRF porté en champ caché —
 * appeler `ensureCsrf()` avant, sinon le cookie peut manquer.
 *
 * `flow` distingue l'ouverture de session (« login ») du rattachement d'un
 * fournisseur à un compte déjà connecté (« connect »).
 */
export function authStartProviderRedirect(input: {
  provider: string;
  flow: "login" | "connect";
  callbackUrl: string;
}): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${getApiBaseUrl()}/auth/${ALLAUTH_CLIENT}/v1/auth/provider/redirect`;

  const add = (name: string, value: string) => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    field.value = value;
    form.appendChild(field);
  };

  const csrf = getCsrfToken();
  if (csrf) add("csrfmiddlewaretoken", csrf);

  add("provider", input.provider);
  add("process", input.flow);
  add("callback_url", input.callbackUrl);

  document.body.appendChild(form);
  form.submit();
}

export async function authLogout(): Promise<void> {
  await apiJson(`/auth/${ALLAUTH_CLIENT}/v1/auth/session`, { method: "DELETE" });
}

export async function authVerifyEmail(key: string): Promise<unknown> {
  return apiJson(`/auth/${ALLAUTH_CLIENT}/v1/auth/email/verify`, jsonBody("POST", { key }));
}

// Pas d'helper de renvoi d'email ici : `auth/email/verify/resend` n'existe que
// pour la vérification par code (`ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED`)
// et répond 409 sans rien envoyer dans notre configuration par lien. C'est
// `authLogin` qui déclenche le renvoi — voir `EmailVerificationStage`.

export async function authRequestPasswordReset(email: string): Promise<void> {
  await apiPostOkOr401(`/auth/${ALLAUTH_CLIENT}/v1/auth/password/request`, {
    email: email.trim(),
  });
}

export async function authResetPassword(input: { key: string; password: string }): Promise<void> {
  await apiPostOkOr401(`/auth/${ALLAUTH_CLIENT}/v1/auth/password/reset`, {
    key: input.key,
    password: input.password,
  });
}

export async function accountChangeEmail(email: string): Promise<unknown> {
  return apiJson(
    `/auth/${ALLAUTH_CLIENT}/v1/account/email`,
    jsonBody("POST", { email: email.trim() })
  );
}

export async function accountChangePassword(input: {
  new_password: string;
  current_password?: string;
}): Promise<unknown> {
  const payload: { new_password: string; current_password?: string } = {
    new_password: input.new_password,
  };
  const current = (input.current_password ?? "").trim();
  if (current) payload.current_password = current;

  return apiJson(`/auth/${ALLAUTH_CLIENT}/v1/account/password/change`, jsonBody("POST", payload));
}
