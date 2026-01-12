"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronUp as ChevronUpIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Star as StarIcon,
  Text as TextIcon,
  Book as BookIcon,
  BookOpen as BookOpenIcon,
} from "lucide-react";

import { ThemeIcon, resolveGeneratedThumbMeta } from "@/components/GeneratedThumb";
import { SeeMoreRenderer } from "@/components/SeeMoreRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  createDeck,
  fetchCardDecks,
  fetchMe,
  fetchMicroArticleSavedStatus,
  saveMicroArticle,
  setMicroArticleReadState,
  unsaveMicroArticle,
  updateCardDecks,
} from "@/lib/api";
import { addLessonTime, markLessonSeen, setLessonCompletion } from "@/lib/progressStore";
import { ensureProgressSyncLoop, scheduleProgressSync, setProgressSyncEnabled } from "@/lib/progressSync";
import type { DeckMembership, MicroArticleDetail, StreamBlock } from "@/lib/types";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";
const SLIDE_TRANSITION_STORAGE_KEY = "pp_reader_slide_transition";
const SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY = "pp_reader_slide_dir";

type DeckState = {
  slugs: string[];
  index: number;
  savedAt: number;
};

const LONG_PREVIEW_MAX_HEIGHT = 120;
const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "")) ||
  "";

function normalizeImageUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (!API_BASE) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function readDeckFromSession(): DeckState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeckState>;
    if (!Array.isArray(parsed.slugs)) return null;
    const index = typeof parsed.index === "number" ? parsed.index : 0;
    return {
      slugs: parsed.slugs.filter((s) => typeof s === "string"),
      index,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writePendingSlideDirectionToSession(dir: "next" | "prev") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY, dir);
  } catch {
    // ignore
  }
}

function readAndClearPendingSlideDirectionFromSession(): "next" | "prev" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY);
    window.sessionStorage.removeItem(SLIDE_TRANSITION_PENDING_DIR_SESSION_KEY);
    if (v === "next" || v === "prev") return v;
    return null;
  } catch {
    return null;
  }
}

function writeDeckToSession(next: DeckState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Error writing deck to session:", error);
  }
}

function readSlideTransitionPreferenceFromStorage() {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(SLIDE_TRANSITION_STORAGE_KEY);
    if (v == null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

function RichText({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function CreditLine({
  creditText,
  sourceUrl,
  license,
  licenseUrl,
}: {
  creditText?: string | null;
  sourceUrl?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
}) {
  if (!creditText && !license) return null;
  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      {creditText ? (
        sourceUrl ? (
          <Link href={sourceUrl} target="_blank" className="underline">
            {creditText}
          </Link>
        ) : (
          creditText
        )
      ) : null}
      {license ? (
        <>
          {creditText ? " " : ""}
          {licenseUrl ? (
            <Link href={licenseUrl} target="_blank" className="underline">
              ({license})
            </Link>
          ) : (
            <>({license})</>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function ReaderClient({
  data,
}: {
  data: MicroArticleDetail;
}) {
  const router = useRouter();

  const [openDetails, setOpenDetails] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [isRead, setIsRead] = React.useState(false);
  const [isReadLoading, setIsReadLoading] = React.useState(false);
  const [largeText, setLargeText] = React.useState(false);

  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const [slideTransitionEnabled, setSlideTransitionEnabled] = React.useState<boolean>(() =>
    readSlideTransitionPreferenceFromStorage()
  );

  const [incomingSlideDir, setIncomingSlideDir] = React.useState<"next" | "prev" | null>(null);
  const [incomingSlideActive, setIncomingSlideActive] = React.useState(false);
  const [outgoingSlideDir, setOutgoingSlideDir] = React.useState<"next" | "prev" | null>(null);
  const navLockRef = React.useRef(false);

  const isLoggedIn = Boolean(currentUserEmail);

  React.useEffect(() => {
    ensureProgressSyncLoop();
    setProgressSyncEnabled(isLoggedIn);
  }, [isLoggedIn]);

  React.useEffect(() => {
    markLessonSeen(data.id);
    if (isLoggedIn) scheduleProgressSync("lesson_seen");
  }, [data.id, isLoggedIn]);

  React.useEffect(() => {
    const startedAt = Date.now();
    return () => {
      const delta = Date.now() - startedAt;
      addLessonTime(data.id, delta);
      if (isLoggedIn) scheduleProgressSync("lesson_time");
    };
  }, [data.id, isLoggedIn]);

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
  }, [data.slug, isLoggedIn, slideTransitionEnabled]);

  const [deckPickerOpen, setDeckPickerOpen] = React.useState(false);
  const [deckMembership, setDeckMembership] = React.useState<DeckMembership[] | null>(null);
  const [deckPickerLoading, setDeckPickerLoading] = React.useState(false);
  const [deckPickerSaving, setDeckPickerSaving] = React.useState(false);
  const [deckCreateName, setDeckCreateName] = React.useState("");
  const [deckCreateLoading, setDeckCreateLoading] = React.useState(false);

  const [deck, setDeck] = React.useState<DeckState | null>(null);

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 1800);
  };

  const cardMotionStyle = React.useMemo(() => {
    const base: React.CSSProperties = {
      transform: "translateX(0)",
    };

    if (outgoingSlideDir === "next") {
      return { ...base, transform: "translateX(-18%)" };
    }
    if (outgoingSlideDir === "prev") {
      return { ...base, transform: "translateX(18%)" };
    }

    if (incomingSlideDir === "next") {
      return incomingSlideActive
        ? { ...base, transform: "translateX(18%)" }
        : base;
    }
    if (incomingSlideDir === "prev") {
      return incomingSlideActive
        ? { ...base, transform: "translateX(-18%)" }
        : base;
    }

    return base;
  }, [incomingSlideActive, incomingSlideDir, outgoingSlideDir]);

  const loadDeckMembership = React.useCallback(async () => {
    if (!isLoggedIn) return;
    setDeckPickerLoading(true);
    try {
      const rows = await fetchCardDecks(data.id);
      setDeckMembership(rows);
    } catch {
      setDeckMembership(null);
      showMessage("Impossible de charger les decks.");
    } finally {
      setDeckPickerLoading(false);
    }
  }, [data.id, isLoggedIn]);

  const openDeckPicker = React.useCallback(() => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour sauvegarder cette carte.");
      return;
    }
    setDeckPickerOpen(true);
  }, [isLoggedIn]);

  React.useEffect(() => {
    if (!deckPickerOpen) return;
    void loadDeckMembership();
  }, [deckPickerOpen, loadDeckMembership]);

  React.useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        setCurrentUserEmail(me.email || null);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUserEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    setSaved(Boolean(data.is_saved));
  }, [data.slug, data.is_saved]);

  React.useEffect(() => {
    setIsRead(Boolean(data.is_read));
  }, [data.slug, data.is_read]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetchMicroArticleSavedStatus(data.slug)
      .then((res) => {
        if (cancelled) return;
        setSaved(Boolean(res.saved));
      })
      .catch(() => {
        // ignore: keep current state
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, data.slug]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setIsRead(true);
    setLessonCompletion(data.id, true);
    scheduleProgressSync("auto_read");
    setMicroArticleReadState(data.slug, true).catch(() => {
      if (cancelled) return;
      // ignore: keep optimistic state
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, data.slug]);

  const toggleSaved = async (source: "button" | "double_tap") => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour sauvegarder cette carte.");
      return;
    }

    const next = !saved;
    setSaved(next);
    try {
      if (next) await saveMicroArticle(data.slug);
      else await unsaveMicroArticle(data.slug);
    } catch {
      setSaved(!next);
      showMessage(
        source === "button"
          ? "Impossible de sauvegarder pour le moment."
          : "Impossible de sauvegarder par double tap."
      );
    }
  };

  const toggleRead = async () => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour marquer lu / non lu.");
      return;
    }

    if (isReadLoading) return;
    const next = !isRead;
    setIsRead(next);
    setLessonCompletion(data.id, next);
    scheduleProgressSync("toggle_read");
    setIsReadLoading(true);
    try {
      await setMicroArticleReadState(data.slug, next);
      showMessage(next ? "Carte marquée comme lue." : "Carte marquée comme non lue.");
    } catch {
      setIsRead(!next);
      showMessage("Impossible de mettre à jour l'état lu.");
    } finally {
      setIsReadLoading(false);
    }
  };

  React.useEffect(() => {
    const d = readDeckFromSession();
    if (!d) {
      setDeck(null);
      return;
    }

    const idx = d.slugs.indexOf(data.slug);
    if (idx >= 0 && idx !== d.index) {
      const next = { ...d, index: idx };
      setDeck(next);
      writeDeckToSession(next);
    } else {
      setDeck(d);
    }
  }, [data.slug]);

  const positionText = React.useMemo(() => {
    if (!deck?.slugs?.length) return null;
    const idx = deck.slugs.indexOf(data.slug);
    const current = idx >= 0 ? idx : deck.index;
    return `${current + 1}/${deck.slugs.length}`;
  }, [deck, data.slug]);

  const blocks = React.useMemo(() => (data.see_more ?? []) as StreamBlock[], [data.see_more]);
  const detailBlocks = React.useMemo(() => blocks.filter((b) => b?.type === "detail"), [blocks]);
  const referenceBlocks = React.useMemo(
    () => blocks.filter((b) => b?.type === "references"),
    [blocks]
  );
  const extraBlocks = React.useMemo(
    () => blocks.filter((b) => b?.type !== "detail" && b?.type !== "references"),
    [blocks]
  );

  const hasLongContent = detailBlocks.length > 0;
  const hasSources = referenceBlocks.length > 0 || (data.links?.length ?? 0) > 0;
  const hasExtra = extraBlocks.length > 0;
  const hasDetails = hasLongContent || hasSources || hasExtra;

  const inlineIllustrationUrl = React.useMemo(() => {
    if (data.cover_image_url) return normalizeImageUrl(data.cover_image_url);
    const imageBlock = blocks.find((b) => b?.type === "image");
    const v = imageBlock && typeof imageBlock.value === "object" ? (imageBlock.value as Record<string, unknown>) : null;
    const image = v && typeof v.image === "object" ? (v.image as Record<string, unknown>) : null;
    const url = image && typeof image.url === "string" ? normalizeImageUrl(image.url) : null;
    return url;
  }, [blocks, data.cover_image_url]);

  const coverCredit = React.useMemo(() => {
    const img = data.cover_image;
    if (!img) return null;
    return {
      creditText: typeof img.credit_text === "string" ? img.credit_text : null,
      sourceUrl: typeof img.credit_source_url === "string" ? img.credit_source_url : null,
      license: typeof img.credit_license === "string" ? img.credit_license : null,
      licenseUrl: typeof img.credit_license_url === "string" ? img.credit_license_url : null,
    };
  }, [data.cover_image]);

  const primaryCategory = React.useMemo(() => {
    const fromPayload =
      data.categories_pharmacologie_payload?.[0] ||
      data.categories_maladies_payload?.[0] ||
      data.categories_classes_payload?.[0];
    if (fromPayload?.name) return fromPayload.name;

    const fromStrings =
      data.categories_pharmacologie?.[0] || data.categories_maladies?.[0] || data.categories_classes?.[0];
    return fromStrings || null;
  }, [
    data.categories_classes,
    data.categories_classes_payload,
    data.categories_maladies,
    data.categories_maladies_payload,
    data.categories_pharmacologie,
    data.categories_pharmacologie_payload,
  ]);

  const longPreviewHtml = React.useMemo(() => {
    const firstDetail = detailBlocks.find((b) => b?.type === "detail");
    if (firstDetail && typeof firstDetail.value === "string" && firstDetail.value.trim()) {
      return firstDetail.value;
    }
    return data.takeaway;
  }, [detailBlocks, data.takeaway]);

  const hasLongPreview = Boolean(longPreviewHtml);

  const longPreviewRef = React.useRef<HTMLDivElement | null>(null);
  const [longPreviewMaxHeight, setLongPreviewMaxHeight] = React.useState<number | null>(
    LONG_PREVIEW_MAX_HEIGHT
  );
  const [longPreviewIsTruncated, setLongPreviewIsTruncated] = React.useState(false);

  const publishedLabel = React.useMemo(() => {
    if (!data.published_at) return null;
    const dt = new Date(data.published_at);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString();
  }, [data.published_at]);

  const headerMeta = React.useMemo(
    () =>
      resolveGeneratedThumbMeta({
        categories_theme_payload: data.categories_theme_payload,
        categories_maladies_payload: data.categories_maladies_payload,
        categories_medicament_payload: data.categories_medicament_payload,
      }),
    [data.categories_maladies_payload, data.categories_medicament_payload, data.categories_theme_payload]
  );

  React.useEffect(() => {
    const seeMoreTypes = Array.isArray(data.see_more)
      ? (data.see_more as StreamBlock[])
          .map((b) => (b && typeof b === "object" ? b.type : "unknown"))
          .filter(Boolean)
      : [];

    console.debug("[ReaderClient] micro payload", {
      slug: data.slug,
      title: data.title,
      seeMoreTypes,
      detailCount: detailBlocks.length,
      referenceCount: referenceBlocks.length,
      extraCount: extraBlocks.length,
      linksCount: data.links?.length ?? 0,
      hasLongContent,
      hasSources,
      hasExtra,
      hasDetails,
    });

    if (data.see_more) {
      console.debug("[ReaderClient] see_more raw", data.see_more);
    }
    if (data.links) {
      console.debug("[ReaderClient] links raw", data.links);
    }
  }, [
    data.slug,
    data.title,
    data.see_more,
    data.links,
    detailBlocks.length,
    referenceBlocks.length,
    extraBlocks.length,
    hasLongContent,
    hasSources,
    hasExtra,
    hasDetails,
  ]);

  React.useEffect(() => {
    const el = longPreviewRef.current;
    if (!el) return;

    const measure = () => {
      setLongPreviewMaxHeight(LONG_PREVIEW_MAX_HEIGHT);
      requestAnimationFrame(() => {
        const nextEl = longPreviewRef.current;
        if (!nextEl) return;
        const isOverflowing = nextEl.scrollHeight > nextEl.clientHeight + 1;
        setLongPreviewIsTruncated(isOverflowing);
        if (!isOverflowing) setLongPreviewMaxHeight(null);
      });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [data.slug, longPreviewHtml, largeText]);

  const goRelative = React.useCallback(
    (delta: number) => {
      if (navLockRef.current) return;
      if (!deck?.slugs?.length) return;
      const idx = deck.slugs.indexOf(data.slug);
      const current = idx >= 0 ? idx : deck.index;
      const nextIndex = current + delta;
      if (nextIndex < 0 || nextIndex >= deck.slugs.length) return;
      const nextSlug = deck.slugs[nextIndex];
      if (!nextSlug) return;

      const doNavigate = () => {
        const nextDeck = { ...deck, index: nextIndex };
        setDeck(nextDeck);
        writeDeckToSession(nextDeck);
        router.push(`/micro/${encodeURIComponent(nextSlug)}`);
      };

      const shouldAnimate = isLoggedIn ? slideTransitionEnabled : true;
      if (!shouldAnimate) {
        doNavigate();
        return;
      }

      const dir: "next" | "prev" = delta > 0 ? "next" : "prev";
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
    [deck, data.slug, isLoggedIn, router, slideTransitionEnabled]
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenDetails(false);
        return;
      }
      if (openDetails) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRelative(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRelative(+1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDetails, goRelative]);

  const startRef = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const sheetStartRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const saveLongPressTimerRef = React.useRef<number | null>(null);
  const saveLongPressTriggeredRef = React.useRef(false);

  const clearSaveLongPressTimer = () => {
    if (saveLongPressTimerRef.current) {
      window.clearTimeout(saveLongPressTimerRef.current);
      saveLongPressTimerRef.current = null;
    }
  };

  const onSavePointerDown = () => {
    if (!isLoggedIn) return;
    saveLongPressTriggeredRef.current = false;
    clearSaveLongPressTimer();
    saveLongPressTimerRef.current = window.setTimeout(() => {
      saveLongPressTriggeredRef.current = true;
      openDeckPicker();
    }, 550);
  };

  const onSavePointerUp = () => {
    clearSaveLongPressTimer();
  };

  const onSaveClick = () => {
    if (saveLongPressTriggeredRef.current) {
      saveLongPressTriggeredRef.current = false;
      return;
    }
    void toggleSaved("button");
  };

  const onSaveContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openDeckPicker();
  };

  const selectedDeckIds = React.useMemo(() => {
    if (!deckMembership) return [] as number[];
    return deckMembership.filter((d) => d.is_member).map((d) => d.id);
  }, [deckMembership]);

  const toggleDeckMembership = async (deckId: number) => {
    if (!deckMembership || deckPickerSaving) return;
    const next = deckMembership.map((d) =>
      d.id === deckId ? { ...d, is_member: !d.is_member } : d
    );
    setDeckMembership(next);

    const nextDeckIds = next.filter((d) => d.is_member).map((d) => d.id);
    setDeckPickerSaving(true);
    try {
      await updateCardDecks(data.id, nextDeckIds);
    } catch {
      showMessage("Impossible de mettre à jour les decks.");
      await loadDeckMembership();
    } finally {
      setDeckPickerSaving(false);
    }
  };

  const onCreateDeckFromPicker = async () => {
    const name = deckCreateName.trim();
    if (!name || deckCreateLoading || deckPickerSaving) return;
    setDeckCreateLoading(true);
    try {
      const created = await createDeck(name);
      const nextDeckIds = Array.from(new Set([...selectedDeckIds, created.id]));
      await updateCardDecks(data.id, nextDeckIds);
      setDeckCreateName("");
      await loadDeckMembership();
    } catch {
      showMessage("Impossible de créer le deck.");
    } finally {
      setDeckCreateLoading(false);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (deckPickerOpen) return;
    if (openDetails) return;
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (deckPickerOpen) return;
    if (openDetails) return;
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    const canSwipeOpenFromHere =
      typeof window !== "undefined" ? start.y > window.innerHeight * 0.55 : true;

    if (hasDetails && canSwipeOpenFromHere && ady > 60 && ady > adx * 1.2 && dy < 0) {
      setOpenDetails(true);
      return;
    }

    // Double tap to save (only when it's a tap, not a swipe)
    if (adx < 10 && ady < 10) {
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && now - last.t < 320) {
        const ddx = t.clientX - last.x;
        const ddy = t.clientY - last.y;
        if (Math.abs(ddx) < 30 && Math.abs(ddy) < 30) {
          lastTapRef.current = null;
          void toggleSaved("double_tap");
          return;
        }
      }
      lastTapRef.current = { x: t.clientX, y: t.clientY, t: now };
      return;
    }

    if (adx < 60) return;
    if (adx < ady * 1.2) return;

    if (dx < 0) goRelative(+1);
    else goRelative(-1);
  };

  const onSheetHandleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    sheetStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onSheetHandleTouchEnd = (e: React.TouchEvent) => {
    const start = sheetStartRef.current;
    sheetStartRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (ady > 60 && ady > adx * 1.2 && dy > 0) {
      setOpenDetails(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-2">
          <Button asChild variant="ghost" size="icon" aria-label="Retour">
            <Link href="/discover">←</Link>
          </Button>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Taille du texte"
            onClick={() => setLargeText((v) => !v)}
          >
            <TextIcon className="size-5" />
          </Button>

          <Button
            variant={saved ? "secondary" : "ghost"}
            size="icon"
            aria-label="Sauvegarder"
            className={!isLoggedIn ? "opacity-40" : ""}
            onPointerDown={onSavePointerDown}
            onPointerUp={onSavePointerUp}
            onPointerLeave={onSavePointerUp}
            onPointerCancel={onSavePointerUp}
            onContextMenu={onSaveContextMenu}
            onClick={onSaveClick}
          >
            <StarIcon className="size-5" fill={saved ? "currentColor" : "none"} />
          </Button>

          <Button
            variant={isRead ? "secondary" : "ghost"}
            size="icon"
            aria-label="Marquer comme lu"
            className={!isLoggedIn ? "opacity-40" : ""}
            title={isRead ? "Marquer comme non lue" : "Marquer comme lue"}
            onClick={() => void toggleRead()}
            disabled={isReadLoading}
          >
            {isRead ? <BookIcon className="size-5" /> : <BookOpenIcon className="size-5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Plus"
            onClick={() => setOpenDetails(true)}
            disabled={!hasDetails}
          >
            <MoreHorizontalIcon className="size-5" />
          </Button>
        </div>

        {message ? (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2 text-xs text-muted-foreground">
            {message}
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className={largeText ? "space-y-3 text-[1.05rem]" : "space-y-3"}>
          <div
            className={cn(
              "rounded-2xl border bg-card p-5 shadow-sm",
              incomingSlideDir || outgoingSlideDir
                ? "transition-transform duration-120 ease-out will-change-transform"
                : ""
            )}
            style={
              {
                viewTransitionName: "pp-reader-card",
                ...(incomingSlideDir || outgoingSlideDir ? cardMotionStyle : null),
              } as React.CSSProperties
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {headerMeta.labelRaw ? (
                <Badge
                  variant="secondary"
                  className="max-w-full truncate border-transparent"
                  style={{
                    backgroundColor: headerMeta.visual.bg,
                    color: "rgba(255,255,255,0.96)",
                  }}
                >
                  <ThemeIcon theme={headerMeta.theme} size={14} />
                  <span className="truncate">{headerMeta.labelRaw}</span>
                </Badge>
              ) : primaryCategory ? (
                <Badge variant="secondary" className="max-w-full truncate">
                  {primaryCategory}
                </Badge>
              ) : null}
              {publishedLabel ? <div>Publié le {publishedLabel}</div> : null}
            </div>

            <div className="mt-3 text-2xl font-semibold leading-snug">{data.title}</div>

            <div className="mt-3 space-y-3">
              <div className="relative">
                <RichText
                  html={data.answer_express}
                  className={cn(
                    "prose prose-zinc max-w-none text-[1.05rem] leading-relaxed text-foreground dark:prose-invert",
                    largeText ? "text-[1.15rem]" : ""
                  )}
                />
              </div>

              {inlineIllustrationUrl ? (
                <div>
                  <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
                    <Image
                      src={inlineIllustrationUrl}
                      alt={data.title}
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, 768px"
                      priority
                    />
                  </div>
                  <CreditLine
                    creditText={coverCredit?.creditText ?? data.cover_image_credit ?? null}
                    sourceUrl={coverCredit?.sourceUrl ?? null}
                    license={coverCredit?.license ?? null}
                    licenseUrl={coverCredit?.licenseUrl ?? null}
                  />
                </div>
              ) : null}
            </div>

            {hasLongPreview ? (
              <div className="relative mt-4">
                <div
                  ref={longPreviewRef}
                  className="prose prose-zinc max-w-none text-sm text-muted-foreground dark:prose-invert"
                  style={
                    longPreviewMaxHeight
                      ? { maxHeight: longPreviewMaxHeight, overflow: "hidden" }
                      : undefined
                  }
                >
                  <RichText html={longPreviewHtml} />
                </div>
                {longPreviewIsTruncated ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-card" />
                ) : null}
              </div>
            ) : null}

            {data.key_points?.length ? (
              <div className="mt-4 flex flex-wrap gap-1">
                {data.key_points.slice(0, 3).map((p) => (
                  <Badge key={p} variant="secondary" className="max-w-full truncate">
                    {p}
                  </Badge>
                ))}
              </div>
            ) : null}

            {hasDetails ? (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  className="mx-auto flex items-center justify-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                  onClick={() => setOpenDetails(true)}
                  aria-label="Glisser pour ouvrir les détails et sources"
                >
                  <span>Glisser pour détails & sources</span>
                  <ChevronUpIcon className="size-4" />
                </button>

                <Button type="button" className="w-full" onClick={() => setOpenDetails(true)}>
                  Voir détails & sources
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-6 text-xs text-muted-foreground">
        <div>{positionText ?? ""}</div>
        {deck?.slugs?.length ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Précédent"
              onClick={() => goRelative(-1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Suivant"
              onClick={() => goRelative(+1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        ) : (
          <div />
        )}
      </footer>

      <Sheet open={openDetails} onOpenChange={setOpenDetails}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
          <button
            type="button"
            className="px-4 pt-3"
            aria-label="Glisser vers le bas pour fermer"
            onTouchStart={onSheetHandleTouchStart}
            onTouchEnd={onSheetHandleTouchEnd}
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-muted" />
          </button>

          <SheetHeader>
            <SheetTitle>Détails & sources</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4 pb-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold">{data.title}</div>
                <RichText
                  html={data.takeaway}
                  className="prose prose-zinc max-w-none text-sm text-muted-foreground dark:prose-invert"
                />
              </div>

              {hasLongContent ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Contenu long</div>
                    <SeeMoreRenderer seeMore={detailBlocks} />
                  </div>
                </>
              ) : null}

              {hasExtra ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Informations supplémentaires</div>
                    <SeeMoreRenderer seeMore={extraBlocks} />
                  </div>
                </>
              ) : null}

              {hasSources ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Sources</div>

                    <div className="rounded-xl border bg-card p-4">
                      <div className="text-sm font-semibold">Crédibilité</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {data.published_at ? (
                          <div>Publié le {new Date(data.published_at).toLocaleDateString()}</div>
                        ) : (
                          <div>Date de vérification à ajouter.</div>
                        )}
                      </div>
                    </div>

                    <SeeMoreRenderer seeMore={referenceBlocks} links={data.links} />
                  </div>
                </>
              ) : null}

              {data.questions?.length ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Questions</div>
                    <div className="space-y-3">
                      {data.questions.map((q) => (
                        <div key={q.id} className="rounded-xl border p-4">
                          <div className="text-sm font-semibold">{q.prompt}</div>
                          {q.explanation ? (
                            <div className="mt-2 text-sm text-muted-foreground">
                              {q.explanation}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet open={deckPickerOpen} onOpenChange={setDeckPickerOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Ajouter à un deck</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4 pb-6">
            <div className="space-y-4">
              {deckPickerLoading ? (
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                  Chargement…
                </div>
              ) : deckMembership?.length ? (
                <div className="space-y-2">
                  {deckMembership.map((d) => (
                    <div
                      key={d.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2"
                      onClick={() => void toggleDeckMembership(d.id)}
                      aria-disabled={deckPickerSaving}
                    >
                      <Checkbox
                        checked={d.is_member}
                        disabled={deckPickerSaving}
                        onCheckedChange={() => void toggleDeckMembership(d.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        {d.is_default ? (
                          <div className="text-xs text-muted-foreground">Par défaut</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                  Aucun deck.
                </div>
              )}

              <Separator />

              <div className="flex gap-2">
                <Input
                  value={deckCreateName}
                  onChange={(e) => setDeckCreateName(e.target.value)}
                  placeholder="Nouveau deck…"
                />
                <Button
                  type="button"
                  onClick={() => void onCreateDeckFromPicker()}
                  disabled={deckCreateLoading || deckPickerSaving}
                >
                  Créer
                </Button>
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="pt-0">
            <Button
              type="button"
              onClick={() => setDeckPickerOpen(false)}
              disabled={deckPickerSaving || deckCreateLoading}
            >
              Terminé
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
