"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useUpdateOfficialPackProgress } from "@/lib/queries";
import {
  SLIDE_TRANSITION_STORAGE_KEY,
  readAndClearPendingSlideDirectionFromSession,
  readDeckFromSession,
  readSlideTransitionPreferenceFromStorage,
  writeDeckToSession,
  writePendingSlideDirectionToSession,
  type DeckState,
  type SlideDirection,
} from "./readerSession";

export type DeckNavigation = {
  /** Deck de lecture courant, ou `null` si la fiche est ouverte hors parcours. */
  deck: DeckState | null;
  /** « 3/12 », ou `null` hors parcours. */
  positionText: string | null;
  goRelative: (delta: number) => void;
  /** Classe et style à poser sur la carte pour l'animation de glissement. */
  cardMotion: { className: string; style: React.CSSProperties | undefined };
};

/**
 * Force le préchargement du rendu complet des fiches voisines.
 *
 * La fiche est une page dynamique — elle lit le cookie de session au rendu —
 * et le préchargement Next par défaut (« auto ») ne rapporterait alors que
 * l'enveloppe de route, sans le contenu : le swipe paierait encore l'aller-
 * retour serveur. `PrefetchKind` n'étant pas exporté publiquement par Next, on
 * passe la valeur littérale que l'énumération recouvre.
 */
const FULL_PREFETCH = { kind: "full" } as unknown as Parameters<
  ReturnType<typeof useRouter>["prefetch"]
>[1];

/** Délai maximal accordé au navigateur avant de précharger malgré tout. */
const PREFETCH_IDLE_TIMEOUT_MS = 2000;

/** Repli quand `requestIdleCallback` manque (Safari < 17). */
const PREFETCH_FALLBACK_DELAY_MS = 300;

/**
 * Navigation d'une fiche à l'autre dans un deck, animation comprise.
 *
 * Chaque fiche est une page à part entière : l'animation se joue donc en deux
 * temps, une sortie avant `router.push` et une entrée après remontage, reliées
 * par le sens de glissement écrit en session.
 */
export function useDeckNavigation({
  slug,
  cardId,
  isLoggedIn,
}: {
  slug: string;
  cardId: number;
  isLoggedIn: boolean;
}): DeckNavigation {
  const router = useRouter();
  const updatePackProgressMutation = useUpdateOfficialPackProgress();

  const [slideTransitionEnabled, setSlideTransitionEnabled] = React.useState<boolean>(() =>
    readSlideTransitionPreferenceFromStorage()
  );

  const [incomingSlideDir, setIncomingSlideDir] = React.useState<SlideDirection | null>(null);
  const [incomingSlideActive, setIncomingSlideActive] = React.useState(false);
  const [outgoingSlideDir, setOutgoingSlideDir] = React.useState<SlideDirection | null>(null);
  const navLockRef = React.useRef(false);

  const [deck, setDeck] = React.useState<DeckState | null>(null);

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SLIDE_TRANSITION_STORAGE_KEY) return;
      setSlideTransitionEnabled(readSlideTransitionPreferenceFromStorage());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  React.useEffect(() => {
    const shouldAnimate = isLoggedIn ? slideTransitionEnabled : true;
    if (!shouldAnimate) {
      setIncomingSlideDir(null);
      setIncomingSlideActive(false);
      return;
    }

    const dir = readAndClearPendingSlideDirectionFromSession();
    if (!dir) {
      setIncomingSlideDir(null);
      setIncomingSlideActive(false);
      return;
    }

    setIncomingSlideDir(dir);
    setIncomingSlideActive(true);

    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        setIncomingSlideActive(false);
      });
      return raf2;
    });

    const t = window.setTimeout(() => {
      setIncomingSlideDir(null);
      setIncomingSlideActive(false);
    }, 180);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(t);
    };
  }, [slug, isLoggedIn, slideTransitionEnabled]);

  React.useEffect(() => {
    const d = readDeckFromSession();
    if (!d) {
      setDeck(null);
      return;
    }

    const idx = d.slugs.indexOf(slug);
    if (idx >= 0 && idx !== d.index) {
      const next = { ...d, index: idx };
      setDeck(next);
      writeDeckToSession(next);
    } else {
      setDeck(d);
    }
  }, [slug]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    if (!deck?.deckId) return;
    updatePackProgressMutation.mutate({
      deckId: deck.deckId,
      input: { mode_last: "ordered", last_card_id: cardId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, deck?.deckId, isLoggedIn]);

  /** Position réelle dans le deck, `-1` hors parcours. */
  const currentIndex = React.useMemo(() => {
    if (!deck?.slugs?.length) return -1;
    const idx = deck.slugs.indexOf(slug);
    return idx >= 0 ? idx : deck.index;
  }, [deck, slug]);

  const positionText = React.useMemo(() => {
    if (!deck?.slugs?.length || currentIndex < 0) return null;
    return `${currentIndex + 1}/${deck.slugs.length}`;
  }, [deck, currentIndex]);

  const nextSlug = currentIndex >= 0 ? (deck?.slugs[currentIndex + 1] ?? null) : null;
  const prevSlug = currentIndex > 0 ? (deck?.slugs[currentIndex - 1] ?? null) : null;

  /**
   * Précharge les deux fiches voisines.
   *
   * Sans ça, chaque swipe déclenche une navigation Next complète : rendu
   * serveur de la fiche puis remontage du lecteur, soit une attente visible.
   * Le travail est repoussé au premier temps mort pour ne pas concurrencer
   * l'affichage de la fiche courante, et les dépendances sont les slugs eux-
   * mêmes — pas l'objet deck — pour ne pas relancer deux requêtes à chaque
   * réécriture de l'index en session.
   */
  React.useEffect(() => {
    const targets = [nextSlug, prevSlug].filter((s): s is string => Boolean(s));
    if (!targets.length) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const target of targets) {
        router.prefetch(`/micro/${encodeURIComponent(target)}`, FULL_PREFETCH);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }

    const timer = window.setTimeout(run, PREFETCH_FALLBACK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nextSlug, prevSlug, router]);

  const goRelative = React.useCallback(
    (delta: number) => {
      if (navLockRef.current) return;
      if (!deck?.slugs?.length || currentIndex < 0) return;
      const nextIndex = currentIndex + delta;
      if (nextIndex < 0 || nextIndex >= deck.slugs.length) return;
      const targetSlug = deck.slugs[nextIndex];
      if (!targetSlug) return;

      const doNavigate = () => {
        const nextDeck = { ...deck, index: nextIndex };
        setDeck(nextDeck);
        writeDeckToSession(nextDeck);
        router.push(`/micro/${encodeURIComponent(targetSlug)}`);
      };

      const shouldAnimate = isLoggedIn ? slideTransitionEnabled : true;
      if (!shouldAnimate) {
        doNavigate();
        return;
      }

      const dir: SlideDirection = delta > 0 ? "next" : "prev";
      navLockRef.current = true;
      setOutgoingSlideDir(dir);
      writePendingSlideDirectionToSession(dir);

      window.setTimeout(() => {
        doNavigate();
      }, 80);

      window.setTimeout(() => {
        navLockRef.current = false;
        setOutgoingSlideDir(null);
      }, 220);
    },
    [deck, currentIndex, isLoggedIn, router, slideTransitionEnabled]
  );

  const cardMotion = React.useMemo(() => {
    const sliding = Boolean(incomingSlideDir || outgoingSlideDir);
    if (!sliding) {
      return { className: "", style: undefined };
    }

    const className = "transition-transform duration-120 ease-out will-change-transform";
    const base: React.CSSProperties = { transform: "translateX(0)" };

    if (outgoingSlideDir === "next") {
      return { className, style: { ...base, transform: "translateX(-18%)" } };
    }
    if (outgoingSlideDir === "prev") {
      return { className, style: { ...base, transform: "translateX(18%)" } };
    }

    if (incomingSlideDir === "next") {
      return {
        className,
        style: incomingSlideActive ? { ...base, transform: "translateX(18%)" } : base,
      };
    }
    if (incomingSlideDir === "prev") {
      return {
        className,
        style: incomingSlideActive ? { ...base, transform: "translateX(-18%)" } : base,
      };
    }

    return { className, style: base };
  }, [incomingSlideActive, incomingSlideDir, outgoingSlideDir]);

  return { deck, positionText, goRelative, cardMotion };
}
