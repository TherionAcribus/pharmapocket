"use client";

import * as React from "react";
import { Gavel, Leaf, Lightbulb, Pill, Scale, Shield, Stethoscope } from "lucide-react";

import type { CategoryPayload, MicroArticleListItem } from "@/lib/types";

type PatternName = "waves" | "chevrons" | "dots" | "vlines" | "diagonals";

type VisualCode = {
  bg: string;
  accent: string;
  pattern: PatternName;
};

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

function inferDomainFromPathologySlug(slug: string | null | undefined): "infectio" | "cardio" | "endocrino" | "other" {
  const s = (slug ?? "").toLowerCase();
  if (!s) return "other";

  if (s.includes("grippe") || s.includes("zona") || s.includes("covid") || s.includes("infection")) return "infectio";
  if (s === "hta" || s.includes("hypertension") || s.includes("card") || s.includes("coeur")) return "cardio";
  if (s.includes("diab") || s.includes("thyro") || s.includes("endocr")) return "endocrino";
  return "other";
}

function resolveVisualCode(pathologySlug?: string | null): VisualCode {
  const slug = (pathologySlug ?? "").toLowerCase();

  const hardcoded: Record<string, VisualCode> = {
    grippe: { bg: "#6D5BD0", accent: "#D7D2FF", pattern: "waves" },
    zona: { bg: "#7A3E9D", accent: "#E6C8F7", pattern: "chevrons" },
    diabete: { bg: "#2D74DA", accent: "#CFE3FF", pattern: "dots" },
    hta: { bg: "#D64545", accent: "#FFD0D0", pattern: "vlines" },
  };

  if (slug && hardcoded[slug]) return hardcoded[slug];

  const domain = inferDomainFromPathologySlug(slug);
  const byDomain: Record<ReturnType<typeof inferDomainFromPathologySlug>, Omit<VisualCode, "pattern"> & { patterns: PatternName[] }> = {
    infectio: { bg: "#6D5BD0", accent: "#D7D2FF", patterns: ["waves", "chevrons"] },
    cardio: { bg: "#D64545", accent: "#FFD0D0", patterns: ["vlines", "diagonals"] },
    endocrino: { bg: "#2D74DA", accent: "#CFE3FF", patterns: ["dots", "diagonals"] },
    other: { bg: "#444B59", accent: "#DDE1EA", patterns: ["diagonals", "dots"] },
  };

  const seed = hashString(slug || "other");
  const base = byDomain[domain];
  const pattern = base.patterns[seed % base.patterns.length];
  return { bg: base.bg, accent: base.accent, pattern };
}

function truncateLabel(label: string, max: number): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function pickFirst(arr: CategoryPayload[] | undefined): CategoryPayload | null {
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

type ThemeKey =
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

function resolveTheme(item: MicroArticleListItem): ThemeKey {
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

function ThemeIcon({ theme }: { theme: ThemeKey }) {
  const common = { size: 34, strokeWidth: 2.25 };
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

function PatternOverlay({ pattern, accent }: { pattern: PatternName; accent: string }) {
  const strokeWidth = 4;
  const opacity = 0.1;

  if (pattern === "dots") {
    const dots: React.ReactNode[] = [];
    for (let y = 8; y <= 56; y += 12) {
      for (let x = 8; x <= 56; x += 12) {
        dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={2.2} fill={accent} opacity={opacity} />);
      }
    }
    return <>{dots}</>;
  }

  if (pattern === "vlines") {
    const lines: React.ReactNode[] = [];
    for (let x = -8; x <= 72; x += 12) {
      lines.push(
        <line
          key={x}
          x1={x}
          y1={0}
          x2={x}
          y2={64}
          stroke={accent}
          strokeWidth={strokeWidth}
          opacity={opacity}
        />
      );
    }
    return <>{lines}</>;
  }

  if (pattern === "diagonals") {
    const lines: React.ReactNode[] = [];
    for (let x = -64; x <= 64; x += 12) {
      lines.push(
        <line
          key={x}
          x1={x}
          y1={64}
          x2={x + 64}
          y2={0}
          stroke={accent}
          strokeWidth={strokeWidth}
          opacity={opacity}
        />
      );
    }
    return <>{lines}</>;
  }

  if (pattern === "chevrons") {
    const polys: React.ReactNode[] = [];
    for (let y = -8; y <= 72; y += 16) {
      polys.push(
        <polyline
          key={y}
          points={`-8,${y} 16,${y + 12} 40,${y} 64,${y + 12} 88,${y}`}
          fill="none"
          stroke={accent}
          strokeWidth={strokeWidth}
          opacity={opacity}
          strokeLinejoin="round"
        />
      );
    }
    return <>{polys}</>;
  }

  // waves
  const waves: React.ReactNode[] = [];
  for (let y = 10; y <= 70; y += 14) {
    waves.push(
      <path
        key={y}
        d={`M -8 ${y} C 8 ${y - 6}, 24 ${y + 6}, 40 ${y} S 72 ${y - 6}, 88 ${y}`}
        fill="none"
        stroke={accent}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeLinecap="round"
      />
    );
  }
  return <>{waves}</>;
}

export function GeneratedThumb({
  item,
  className,
}: {
  item: MicroArticleListItem;
  className?: string;
}) {
  const pathology = pickFirst(item.categories_maladies_payload ?? undefined);
  const medicament = pickFirst(item.categories_medicament_payload ?? undefined);
  const themeCategory = pickFirst(item.categories_theme_payload ?? undefined);
  const theme = resolveTheme(item);
  const visual = resolveVisualCode(pathology?.slug ?? null);

  const labelRaw =
    theme === "pathologie"
      ? pathology?.name || themeCategory?.name || ""
      : theme === "medicament"
        ? medicament?.name || themeCategory?.name || ""
        : themeCategory?.name || "";

  const label = labelRaw ? truncateLabel(labelRaw, 11) : "";

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
        <PatternOverlay pattern={visual.pattern} accent={visual.accent} />
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
