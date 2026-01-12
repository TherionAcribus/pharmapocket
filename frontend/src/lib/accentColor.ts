const STORAGE_KEY = "pp_accent_color";

function hasWindow() {
  return typeof window !== "undefined";
}

export function normalizeHexColor(value: string) {
  const v = value.trim();
  if (!v) return null;
  if (!v.startsWith("#")) return null;
  const hex = v.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return (
      "#" +
      hex
        .split("")
        .map((c) => c + c)
        .join("")
    ).toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return ("#" + hex).toLowerCase();
  return null;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return { r, g, b };
}

function srgbToLinear(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function pickReadableForeground(backgroundHex: string) {
  const rgb = hexToRgb(backgroundHex);
  if (!rgb) return "oklch(0.145 0 0)";

  const R = srgbToLinear(rgb.r);
  const G = srgbToLinear(rgb.g);
  const B = srgbToLinear(rgb.b);
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;

  return luminance < 0.5 ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)";
}

export function getStoredAccentColor() {
  if (!hasWindow()) return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (!v) return null;
  return normalizeHexColor(v);
}

export function setStoredAccentColor(colorHex: string) {
  const normalized = normalizeHexColor(colorHex);
  if (!normalized) return;
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, normalized);
}

export function clearStoredAccentColor() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function applyAccentColorToDocument(colorHex: string | null) {
  if (!hasWindow()) return;
  const root = document.documentElement;

  const varsToSet = ["--primary", "--primary-foreground", "--ring", "--sidebar-primary", "--sidebar-ring"];

  if (!colorHex) {
    for (const v of varsToSet) root.style.removeProperty(v);
    return;
  }

  const normalized = normalizeHexColor(colorHex);
  if (!normalized) return;

  root.style.setProperty("--primary", normalized);
  root.style.setProperty("--ring", normalized);
  root.style.setProperty("--sidebar-primary", normalized);
  root.style.setProperty("--sidebar-ring", normalized);
  root.style.setProperty("--primary-foreground", pickReadableForeground(normalized));
}
