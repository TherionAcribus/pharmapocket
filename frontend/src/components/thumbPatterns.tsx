"use client";

import * as React from "react";

export type PatternName =
  | "waves"
  | "chevrons"
  | "dots"
  | "vlines"
  | "diagonals"
  | "grid"
  | "crosshatch"
  | "rings"
  | "pluses"
  | "triangles";

export const PATTERN_OPTIONS: PatternName[] = [
  "waves",
  "chevrons",
  "dots",
  "vlines",
  "diagonals",
  "grid",
  "crosshatch",
  "rings",
  "pluses",
  "triangles",
];

export function normalizePattern(value: unknown): PatternName | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return (PATTERN_OPTIONS as string[]).includes(v) ? (v as PatternName) : null;
}

export function ThumbPatternOverlay({ pattern, accent }: { pattern: PatternName; accent: string }) {
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

  if (pattern === "grid") {
    const lines: React.ReactNode[] = [];
    for (let x = -8; x <= 72; x += 12) {
      lines.push(
        <line
          key={`v-${x}`}
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
    for (let y = -8; y <= 72; y += 12) {
      lines.push(
        <line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={64}
          y2={y}
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

  if (pattern === "crosshatch") {
    const lines: React.ReactNode[] = [];
    for (let x = -64; x <= 64; x += 14) {
      lines.push(
        <line
          key={`d1-${x}`}
          x1={x}
          y1={64}
          x2={x + 64}
          y2={0}
          stroke={accent}
          strokeWidth={strokeWidth}
          opacity={opacity}
        />
      );
      lines.push(
        <line
          key={`d2-${x}`}
          x1={x}
          y1={0}
          x2={x + 64}
          y2={64}
          stroke={accent}
          strokeWidth={strokeWidth}
          opacity={opacity}
        />
      );
    }
    return <>{lines}</>;
  }

  if (pattern === "rings") {
    const rings: React.ReactNode[] = [];
    for (let y = 8; y <= 56; y += 16) {
      for (let x = 8; x <= 56; x += 16) {
        rings.push(
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={6}
            fill="none"
            stroke={accent}
            strokeWidth={3}
            opacity={opacity}
          />
        );
      }
    }
    return <>{rings}</>;
  }

  if (pattern === "pluses") {
    const pluses: React.ReactNode[] = [];
    for (let y = 10; y <= 54; y += 14) {
      for (let x = 10; x <= 54; x += 14) {
        pluses.push(
          <g key={`${x}-${y}`} opacity={opacity}>
            <line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke={accent} strokeWidth={strokeWidth} />
            <line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke={accent} strokeWidth={strokeWidth} />
          </g>
        );
      }
    }
    return <>{pluses}</>;
  }

  if (pattern === "triangles") {
    const tris: React.ReactNode[] = [];
    for (let y = -8; y <= 72; y += 16) {
      for (let x = -8; x <= 72; x += 16) {
        tris.push(
          <polygon
            key={`${x}-${y}`}
            points={`${x + 8},${y} ${x},${y + 14} ${x + 16},${y + 14}`}
            fill="none"
            stroke={accent}
            strokeWidth={3}
            opacity={opacity}
          />
        );
      }
    }
    return <>{tris}</>;
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
