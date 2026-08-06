"use client";

import * as React from "react";

const SWIPE_MIN_DISTANCE = 60;
const TAP_MAX_MOVE = 10;
const DOUBLE_TAP_MAX_DELAY = 320;
const DOUBLE_TAP_MAX_MOVE = 30;

type ReaderGesturesOptions = {
  /** Faux quand un panneau est ouvert : il gère alors ses propres gestes. */
  enabled: boolean;
  hasDetails: boolean;
  onOpenDetails: () => void;
  onDoubleTap: () => void;
  onSwipeHorizontal: (delta: number) => void;
};

/**
 * Gestes tactiles de la fiche : swipe horizontal pour changer de carte, swipe
 * vers le haut depuis le bas de l'écran pour ouvrir les détails, double tap
 * pour sauvegarder.
 */
export function useReaderGestures({
  enabled,
  hasDetails,
  onOpenDetails,
  onDoubleTap,
  onSwipeHorizontal,
}: ReaderGesturesOptions) {
  const startRef = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!enabled) return;
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // Ouvrir les détails ne doit pas concurrencer le scroll du contenu :
    // le geste ne compte que s'il part du bas de l'écran.
    const canSwipeOpenFromHere =
      typeof window !== "undefined" ? start.y > window.innerHeight * 0.55 : true;

    if (hasDetails && canSwipeOpenFromHere && ady > 60 && ady > adx * 1.2 && dy < 0) {
      onOpenDetails();
      return;
    }

    // Double tap to save (only when it's a tap, not a swipe)
    if (adx < TAP_MAX_MOVE && ady < TAP_MAX_MOVE) {
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && now - last.t < DOUBLE_TAP_MAX_DELAY) {
        const ddx = t.clientX - last.x;
        const ddy = t.clientY - last.y;
        if (Math.abs(ddx) < DOUBLE_TAP_MAX_MOVE && Math.abs(ddy) < DOUBLE_TAP_MAX_MOVE) {
          lastTapRef.current = null;
          onDoubleTap();
          return;
        }
      }
      lastTapRef.current = { x: t.clientX, y: t.clientY, t: now };
      return;
    }

    if (adx < SWIPE_MIN_DISTANCE) return;
    if (adx < ady * 1.2) return;

    onSwipeHorizontal(dx < 0 ? +1 : -1);
  };

  return { onTouchStart, onTouchEnd };
}
