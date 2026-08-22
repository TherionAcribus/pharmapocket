"use client";

import { sanitizeEditorialHtml } from "@/lib/sanitizeHtml";

/**
 * Rendu du HTML éditorial produit par Wagtail.
 *
 * Le backend nettoie déjà ce HTML (`sanitize_rich_text`), mais c'est le seul
 * point de passage : un champ ajouté demain qui oublierait cet appel deviendrait
 * un XSS direct. On repasse donc la même liste blanche ici, à un coût nul, pour
 * que l'oubli ne coûte qu'un peu de mise en forme.
 */
export function RichText({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeEditorialHtml(html) }}
    />
  );
}
