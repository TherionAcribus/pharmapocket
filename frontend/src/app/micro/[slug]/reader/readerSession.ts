/**
 * État de lecture stocké côté navigateur.
 *
 * Le deck courant et le sens de la transition voyagent par `sessionStorage`
 * parce qu'ils doivent survivre à la navigation entre deux fiches, qui
 * remonte complètement le lecteur.
 */

import { sanitizeNextPath } from "@/lib/authRedirect";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";
const SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY = "pp_reader_slide_dir";
const RETURN_TO_STORAGE_KEY = "pp_reader:returnTo";

export const SLIDE_TRANSITION_STORAGE_KEY = "pp_reader_slide_transition";

export type DeckState = {
  slugs: string[];
  index: number;
  savedAt: number;
  deckId?: number;
};

export type SlideDirection = "next" | "prev";

export function readDeckFromSession(): DeckState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeckState>;
    if (!Array.isArray(parsed.slugs)) return null;
    const index = typeof parsed.index === "number" ? parsed.index : 0;
    const deckId = typeof (parsed as { deckId?: unknown }).deckId === "number" ? parsed.deckId : undefined;
    return {
      slugs: parsed.slugs.filter((s) => typeof s === "string"),
      index,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
      deckId,
    };
  } catch {
    return null;
  }
}

export function writeDeckToSession(next: DeckState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Error writing deck to session:", error);
  }
}

export function writePendingSlideDirectionToSession(dir: SlideDirection) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY, dir);
  } catch {
    // ignore
  }
}

export function readAndClearPendingSlideDirectionFromSession(): SlideDirection | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY);
    window.sessionStorage.removeItem(SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY);
    if (v === "next" || v === "prev") return v;
    return null;
  } catch {
    return null;
  }
}

export function readSlideTransitionPreferenceFromStorage() {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(SLIDE_TRANSITION_STORAGE_KEY);
    if (v == null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

/**
 * Destination de sortie du lecteur, ou `null` si elle n'est pas interne.
 *
 * `sessionStorage` est lisible et modifiable par n'importe quel script de la
 * page : la valeur relue est donc une entrée non fiable, et passe par le même
 * filtre que `?next=`. Exiger un `/` en tête ne suffit pas, `//hote` et
 * `/\hote` en portent un et sont pourtant relus comme une autorité réseau —
 * le `router.push()` qui suit quitterait alors le site.
 */
export function readReturnToFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeNextPath(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY));
  } catch {
    return null;
  }
}
