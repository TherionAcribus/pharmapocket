/**
 * Réglages par défaut et vocabulaire partagés de la révision.
 *
 * La page `/review` et le badge de l'onglet « À revoir » doivent compter la
 * même chose : ces helpers sont le seul endroit qui décide ce que « cartes à
 * revoir » veut dire.
 */

import type { SrsScope } from "@/lib/api/srs";
import type { SrsCounts } from "@/lib/types";

/** Démarrage sans réglage : tout ce que l'utilisateur a mis dans ses decks. */
export const REVIEW_DEFAULT_SCOPE: SrsScope = "all_decks";
export const REVIEW_DEFAULT_ONLY_DUE = true;

/**
 * Cartes que `srs/next/?only_due=true` sait servir tout de suite : les échues
 * et les jamais vues (l'API sert ces dernières sans attendre d'échéance).
 */
export function availableCount(counts: SrsCounts | undefined | null): number {
  if (!counts) return 0;
  return counts.due + counts.new;
}

/** Un badge d'onglet reste lisible : au-delà de 99, on tronque. */
export function formatDueCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function pluralCards(count: number): string {
  return count > 1 ? `${count} cartes` : `${count} carte`;
}
