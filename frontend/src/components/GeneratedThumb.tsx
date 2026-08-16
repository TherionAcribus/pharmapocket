"use client";

import * as React from "react";
import { Gavel, Leaf, Lightbulb, Pill, Scale, Shield, Stethoscope } from "lucide-react";

import type { CategoryPayload, MicroArticleListItem } from "@/lib/types";
import { useThumbOverrides } from "@/lib/thumbOverrides";
import type { PatternName } from "@/components/thumbPatterns";
import { ThumbPatternOverlay } from "@/components/thumbPatterns";

type VisualCode = {
  bg: string;
  accent: string;
  pattern: PatternName;
};

export type { VisualCode };

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Domaines thérapeutiques, alignés sur `CategoryMaladies.Domain` côté backend.
 *
 * Le domaine n'est plus deviné à partir du slug : il est porté par l'arbre de
 * taxonomie « maladies » et sérialisé dans `CategoryPayload.domain` (héritage
 * depuis les ancêtres inclus). Une catégorie sans domaine retombe sur `other`.
 */
export type Domain =
  | "infectio"
  | "cardio"
  | "endocrino"
  | "neuro"
  | "pneumo"
  | "gastro"
  | "dermato"
  | "rhumato"
  | "urogyneco"
  | "onco"
  | "ophtalmo"
  | "other";

type DomainVisual = Omit<VisualCode, "pattern"> & { patterns: PatternName[] };

const DOMAIN_VISUALS: Record<Domain, DomainVisual> = {
  infectio: { bg: "#6D5BD0", accent: "#D7D2FF", patterns: ["waves", "chevrons", "grid"] },
  cardio: { bg: "#D64545", accent: "#FFD0D0", patterns: ["vlines", "diagonals", "crosshatch"] },
  endocrino: { bg: "#2D74DA", accent: "#CFE3FF", patterns: ["dots", "rings", "triangles"] },
  neuro: { bg: "#9B45A8", accent: "#F2D2F7", patterns: ["waves", "rings", "pluses"] },
  pneumo: { bg: "#17879B", accent: "#C8ECF2", patterns: ["chevrons", "waves", "vlines"] },
  gastro: { bg: "#C2661F", accent: "#FFDCC0", patterns: ["diagonals", "crosshatch", "dots"] },
  dermato: { bg: "#C43D6E", accent: "#FFD2E1", patterns: ["dots", "triangles", "pluses"] },
  rhumato: { bg: "#6F8F2A", accent: "#E2F0BE", patterns: ["crosshatch", "grid", "diagonals"] },
  urogyneco: { bg: "#17886B", accent: "#C6EEDD", patterns: ["rings", "waves", "grid"] },
  onco: { bg: "#5C4B8A", accent: "#DCD5F0", patterns: ["triangles", "chevrons", "crosshatch"] },
  ophtalmo: { bg: "#3B6EA5", accent: "#D5E5F5", patterns: ["rings", "dots", "grid"] },
  other: { bg: "#444B59", accent: "#DDE1EA", patterns: ["diagonals", "dots", "pluses", "grid"] },
};

function normalizeDomain(value: string | null | undefined): Domain {
  const v = (value ?? "").trim().toLowerCase();
  // `hasOwn` et pas `in` : `in` remonte la chaîne de prototypes, donc un domaine
  // nommé "constructor" ou "toString" passerait pour une clé valide.
  return Object.hasOwn(DOMAIN_VISUALS, v) ? (v as Domain) : "other";
}

/**
 * Le domaine choisit la palette ; le slug ne sert plus qu'à varier le motif de
 * façon déterministe entre deux pathologies d'un même domaine.
 */
function resolveVisualCode(pathology?: Pick<CategoryPayload, "slug" | "domain"> | null): VisualCode {
  const slug = (pathology?.slug ?? "").toLowerCase();
  const base = DOMAIN_VISUALS[normalizeDomain(pathology?.domain)];

  const seed = hashString(slug || "other");
  const pattern = base.patterns[seed % base.patterns.length];
  return { bg: base.bg, accent: base.accent, pattern };
}

export { resolveVisualCode };

function truncateLabel(label: string, max: number): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function pickFirst(arr: CategoryPayload[] | undefined): CategoryPayload | null {
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

export type ThemeKey =
  | "pathologie"
  | "medicament"
  | "prevention"
  | "conseil"
  | "phytotherapie"
  | "mad"
  | "legislation";

function normalizeThemeSlugOrName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type ThemeSource = {
  categories_theme_payload?: CategoryPayload[];
};

type ThumbMetaSource = ThemeSource & {
  categories_maladies_payload?: CategoryPayload[];
  categories_medicament_payload?: CategoryPayload[];
};

function resolveTheme(item: ThemeSource): ThemeKey {
  const theme = pickFirst(item.categories_theme_payload);
  const key = normalizeThemeSlugOrName(theme?.slug || theme?.name || "");

  // Accept both slugs and names (e.g. "Conseils", "conseil").
  if (key === "pathologie" || key === "pathologies") return "pathologie";
  if (key === "medicament" || key === "medicaments" || key === "medicamentation") return "medicament";
  if (key === "prevention" || key === "prevenir") return "prevention";
  if (key === "conseil" || key === "conseils") return "conseil";
  if (key === "phytotherapie" || key === "phyto" || key === "plantes") return "phytotherapie";
  if (key === "mad" || key === "maintien-a-domicile") return "mad";
  if (key === "legislation" || key === "reglementation" || key === "droit") return "legislation";

  return "conseil";
}

export { resolveTheme };

export function ThemeIcon({ theme, size = 34 }: { theme: ThemeKey; size?: number }) {
  const common = { size, strokeWidth: 2.25 };
  switch (theme) {
    case "medicament":
      return <Pill {...common} />;
    case "prevention":
      return <Shield {...common} />;
    case "pathologie":
      return <Stethoscope {...common} />;
    case "phytotherapie":
      return <Leaf {...common} />;
    case "mad":
      return <Scale {...common} />;
    case "legislation":
      return <Gavel {...common} />;
    case "conseil":
    default:
      return <Lightbulb {...common} />;
  }
}

export function resolveGeneratedThumbMeta(source: ThumbMetaSource): {
  theme: ThemeKey;
  visual: VisualCode;
  labelRaw: string;
  label: string;
} {
  const pathology = pickFirst(source.categories_maladies_payload);
  const medicament = pickFirst(source.categories_medicament_payload);
  const themeCategory = pickFirst(source.categories_theme_payload);
  const theme = resolveTheme(source);
  const visual = resolveVisualCode(pathology);

  const labelRaw =
    theme === "pathologie"
      ? pathology?.name || themeCategory?.name || ""
      : theme === "medicament"
        ? medicament?.name || themeCategory?.name || ""
        : themeCategory?.name || "";

  const label = labelRaw ? truncateLabel(labelRaw, 11) : "";
  return { theme, visual, labelRaw, label };
}

export function resolveGeneratedThumbMetaWithOverrides(
  source: ThumbMetaSource,
  overrides: Record<string, VisualCode> | null | undefined
): {
  theme: ThemeKey;
  visual: VisualCode;
  labelRaw: string;
  label: string;
} {
  const meta = resolveGeneratedThumbMeta(source);
  const pathology = pickFirst(source.categories_maladies_payload);
  const slug = (pathology?.slug ?? "").toLowerCase();
  const override = slug && overrides ? overrides[slug] : null;
  if (!override) return meta;
  return { ...meta, visual: override };
}

export function GeneratedThumb({
  item,
  className,
}: {
  item: MicroArticleListItem;
  className?: string;
}) {
  const { overrides } = useThumbOverrides();
  const { theme, visual, labelRaw, label } = resolveGeneratedThumbMetaWithOverrides(item, overrides);

  return (
    <div className={className ?? "relative h-full w-full"} aria-hidden="true">
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={labelRaw ? `Illustration ${labelRaw}` : "Illustration"}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="0" y="0" width="64" height="64" fill={visual.bg} />
        <ThumbPatternOverlay pattern={visual.pattern} accent={visual.accent} />
        <rect x="0" y="0" width="64" height="64" fill="#000" opacity="0.06" />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.92)" }}>
        <ThemeIcon theme={theme} />
      </div>

      {label ? (
        <div
          className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-semibold leading-none"
          style={{ color: "rgba(255,255,255,0.96)" }}
          title={labelRaw || undefined}
        >
          <span className="block truncate">{label}</span>
        </div>
      ) : null}
    </div>
  );
}
