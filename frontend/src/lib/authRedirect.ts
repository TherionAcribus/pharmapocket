"use client";

import { usePathname } from "next/navigation";

import type { LandingRedirectTarget } from "@/lib/api/auth";

export const LOGIN_PATH = "/account/login";
export const SIGNUP_PATH = "/account/signup";

/** Où atterrir quand aucune destination n'a été demandée. */
export const DEFAULT_NEXT_PATH = "/discover";

/** Pages d'authentification : y renvoyer après connexion ferait une boucle. */
const AUTH_PATHS = [LOGIN_PATH, SIGNUP_PATH, "/account/oauth-callback"];

/** Caractères de contrôle : ils font diverger notre lecture de celle du navigateur. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Ne garde que les chemins internes, et rend `null` pour tout le reste.
 *
 * `?next=` se lit dans l'URL, donc n'importe qui peut le fabriquer : sans ce
 * filtre, un lien `?next=//exemple.test` renverrait l'utilisateur — à l'instant
 * précis où il vient de s'authentifier — sur un site tiers. On exige donc un
 * chemin absolu du site, et on refuse tout ce qu'un navigateur pourrait relire
 * comme une autorité réseau (`//hôte`, `/\hôte`) ou comme un autre schéma.
 */
export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (hasControlChars(next)) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;

  const pathname = next.split(/[?#]/, 1)[0];
  if (AUTH_PATHS.includes(pathname)) return null;

  return next;
}

function withNext(base: string, next: string | null | undefined): string {
  const safe = sanitizeNextPath(next);
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base;
}

/** Lien vers la connexion, qui ramènera sur `next` une fois la session ouverte. */
export function loginHref(next?: string | null): string {
  return withNext(LOGIN_PATH, next);
}

/** Lien vers l'inscription, qui propage `next` jusqu'à la connexion. */
export function signupHref(next?: string | null): string {
  return withNext(SIGNUP_PATH, next);
}

/**
 * Chemin courant, à passer en `next` depuis un état bloqué.
 *
 * Volontairement limité au `pathname` : `useSearchParams()` forcerait chaque
 * page appelante sous une frontière `<Suspense>` au prérendu, et aucun des
 * écrans concernés ne porte son état dans la query.
 */
export function useNextPath(): string {
  return usePathname() || DEFAULT_NEXT_PATH;
}

/** `loginHref()` pointant sur la page courante. */
export function useLoginHref(): string {
  return loginHref(useNextPath());
}

/** `signupHref()` pointant sur la page courante. */
export function useSignupHref(): string {
  return signupHref(useNextPath());
}

/**
 * L'API nomme les destinations (`landing_redirect_target`, les CTA de la
 * landing) sans connaître nos routes : la table de correspondance vit ici.
 * La typer sur l'enum force à traiter toute cible ajoutée côté backend.
 */
const LANDING_TARGET_PATHS: Record<LandingRedirectTarget, string> = {
  start: "/start",
  discover: "/discover",
  cards: "/cards",
  review: "/review",
  quiz: "/quiz",
};

/** Chemin d'une cible d'atterrissage ; `/start` pour une cible inconnue. */
export function landingTargetToPath(target: string | null | undefined): string {
  return LANDING_TARGET_PATHS[target as LandingRedirectTarget] ?? LANDING_TARGET_PATHS.start;
}
