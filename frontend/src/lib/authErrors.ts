/**
 * Traduction des erreurs des flux d'authentification en messages affichables.
 *
 * Les vues allauth headless répondent `{"status": 400, "errors": [{code,
 * message, param}]}`. Sans ce module, le message d'`ApiError` — qui contient le
 * statut, le chemin et le JSON brut — se retrouvait tel quel sous le formulaire.
 *
 * allauth renvoie déjà des messages traduits (`LANGUAGE_CODE = "fr"`), mais en
 * vouvoiement : on préfère nos propres formulations pour les cas courants et on
 * ne retombe sur celles d'allauth que pour les codes non prévus ici.
 */

import { isApiError } from "@/lib/api/client";

export const GENERIC_ERROR_MESSAGE =
  "Une erreur est survenue. Réessaie dans quelques instants.";

export const NETWORK_ERROR_MESSAGE =
  "Impossible de contacter le serveur. Vérifie ta connexion, puis réessaie.";

export const BAD_CREDENTIALS_MESSAGE =
  "Identifiants incorrects. Vérifie ton email (ou pseudo) et ton mot de passe.";

/** Codes allauth dont on veut maîtriser le texte (ton de l'app, concision). */
const MESSAGE_BY_CODE: Record<string, string> = {
  email_password_mismatch: BAD_CREDENTIALS_MESSAGE,
  username_password_mismatch: BAD_CREDENTIALS_MESSAGE,
  phone_password_mismatch: BAD_CREDENTIALS_MESSAGE,
  invalid_login: BAD_CREDENTIALS_MESSAGE,
  incorrect_password: "Mot de passe incorrect.",
  account_inactive: "Ce compte est désactivé.",
  too_many_login_attempts: "Trop de tentatives de connexion. Réessaie plus tard.",
  rate_limited: "Trop de tentatives. Réessaie dans quelques instants.",
  unverified_primary_email:
    "Ton adresse email doit être vérifiée avant de pouvoir te connecter.",
};

type AllauthError = { code?: unknown; message?: unknown; param?: unknown };

function allauthErrors(body: unknown): AllauthError[] {
  if (!body || typeof body !== "object") return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter((e): e is AllauthError => Boolean(e) && typeof e === "object");
}

function messageFor(error: AllauthError): string | null {
  const code = typeof error.code === "string" ? error.code : null;
  if (code && MESSAGE_BY_CODE[code]) return MESSAGE_BY_CODE[code];

  const message = typeof error.message === "string" ? error.message.trim() : "";
  return message || null;
}

/**
 * Message affichable pour une erreur levée par un flux d'auth.
 *
 * `fallback` couvre les réponses d'erreur sans détail exploitable : les écrans
 * de connexion y passent « Identifiants incorrects », un 400/401 muet n'ayant
 * pas d'autre cause plausible. Les pannes réseau et les 5xx gardent leur propre
 * message : les imputer aux identifiants enverrait l'utilisateur sur une
 * fausse piste.
 */
export function authErrorMessage(e: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (!isApiError(e)) {
    // Un `fetch` qui n'aboutit pas lève un `TypeError` (backend éteint, CORS,
    // hors ligne) ; le reste est un bug de notre côté, sans message utile.
    return e instanceof TypeError ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;
  }

  // 429 : `buildApiError` compose déjà un message avec le délai d'attente.
  if (e.status === 429) return e.message;
  if (e.status >= 500) return GENERIC_ERROR_MESSAGE;

  const messages = allauthErrors(e.body)
    .map(messageFor)
    .filter((m): m is string => Boolean(m));

  // `Set` : allauth répète le même message par champ invalide (email + password).
  const unique = Array.from(new Set(messages));
  return unique.length > 0 ? unique.join(" ") : fallback;
}
