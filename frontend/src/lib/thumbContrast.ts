type Rgb = readonly [number, number, number];

export const THUMB_PATTERN_OPACITY = 0.1;
export const THUMB_DARKEN_OVERLAY_ALPHA = 0.06;
export const THUMB_ICON_FOREGROUND_ALPHA = 0.92;
export const THUMB_LABEL_FOREGROUND_ALPHA = 0.96;

export const WCAG_AA_NORMAL_TEXT_RATIO = 4.5;
export const WCAG_NON_TEXT_RATIO = 3;

export type ThumbContrastResult = {
  iconRatio: number;
  labelRatio: number;
  passes: boolean;
};

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

function parseHexColor(value: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function composite(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * linearChannel(color[0]) +
    0.7152 * linearChannel(color[1]) +
    0.0722 * linearChannel(color[2])
  );
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calcule le pire contraste réellement rendu, sur le fond uni comme sous un
 * trait du motif. Le voile noir du SVG et les deux opacités de blanc sont
 * rejoués dans le même ordre que dans `GeneratedThumb`.
 */
export function evaluateThumbContrast(bg: string, accent: string): ThumbContrastResult | null {
  const background = parseHexColor(bg);
  const patternColor = parseHexColor(accent);
  if (!background || !patternColor) return null;

  const backgrounds: Rgb[] = [
    background,
    composite(patternColor, background, THUMB_PATTERN_OPACITY),
  ];

  let iconRatio = Number.POSITIVE_INFINITY;
  let labelRatio = Number.POSITIVE_INFINITY;

  for (const candidate of backgrounds) {
    const renderedBackground = composite(BLACK, candidate, THUMB_DARKEN_OVERLAY_ALPHA);
    const renderedIcon = composite(WHITE, renderedBackground, THUMB_ICON_FOREGROUND_ALPHA);
    const renderedLabel = composite(WHITE, renderedBackground, THUMB_LABEL_FOREGROUND_ALPHA);
    iconRatio = Math.min(iconRatio, contrastRatio(renderedIcon, renderedBackground));
    labelRatio = Math.min(labelRatio, contrastRatio(renderedLabel, renderedBackground));
  }

  return {
    iconRatio,
    labelRatio,
    passes: iconRatio >= WCAG_NON_TEXT_RATIO && labelRatio >= WCAG_AA_NORMAL_TEXT_RATIO,
  };
}
