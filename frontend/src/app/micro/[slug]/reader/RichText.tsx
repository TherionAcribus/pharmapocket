"use client";

/** Rendu du HTML éditorial produit par Wagtail. */
export function RichText({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
