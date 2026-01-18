"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { MicroCard } from "@/components/MicroCard";
import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import {
  bulkAddCardsToDeck,
  copyOfficialPackToUserDeck,
  fetchDecks,
  fetchMe,
  fetchMicroArticleReadStates,
  fetchOfficialPackDetail,
  startOfficialPack,
} from "@/lib/api";
import { getLessonProgress } from "@/lib/progressStore";
import type { DeckSummary, OfficialPackDetail } from "@/lib/types";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";
const RETURN_TO_STORAGE_KEY = "pp_reader:returnTo";

type DeckState = {
  slugs: string[];
  index: number;
  savedAt: number;
  deckId?: number;
};

function readDeckFromSession(): DeckState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeckState>;
    if (!Array.isArray(parsed.slugs)) return null;
    const index = typeof parsed.index === "number" ? parsed.index : 0;
    const deckId = typeof parsed.deckId === "number" ? parsed.deckId : undefined;
    return {
      slugs: parsed.slugs.filter((s) => typeof s === "string"),
      index,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
      deckId,
    };
  } catch {
    return null;
  }
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXT_PUBLIC_MEDIA_BASE || process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (!base) return url;
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function PackDetailPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const packId = Number(routeParams?.id);

  const [pack, setPack] = React.useState<OfficialPackDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [readMap, setReadMap] = React.useState<Record<string, boolean>>({});

  const [userDecks, setUserDecks] = React.useState<DeckSummary[]>([]);
  const [selectedUserDeckId, setSelectedUserDeckId] = React.useState<number | null>(null);
  const [copyLoading, setCopyLoading] = React.useState(false);
  const [bulkAddLoading, setBulkAddLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!Number.isFinite(packId)) return;
    setLoading(true);
    setError(null);
    try {
      const p = await fetchOfficialPackDetail(packId);
      setPack(p);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
      setPack(null);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [packId]);

  React.useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then(() => {
        if (cancelled) return;
        setIsLoggedIn(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoggedIn(false);
      })
      .finally(() => {
        if (cancelled) return;
        void reload();
      });

    return () => {
      cancelled = true;
    };
  }, [reload]);

  React.useEffect(() => {
    if (!isLoggedIn) {
      setUserDecks([]);
      setSelectedUserDeckId(null);
      return;
    }
    let cancelled = false;
    fetchDecks()
      .then((rows) => {
        if (cancelled) return;
        setUserDecks(rows);
        const def = rows.find((d) => d.is_default) ?? rows[0] ?? null;
        setSelectedUserDeckId(def ? def.id : null);
      })
      .catch(() => {
        if (cancelled) return;
        setUserDecks([]);
        setSelectedUserDeckId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const coverSrc = React.useMemo(() => normalizeImageUrl(pack?.cover_image_url), [pack?.cover_image_url]);
  const deckSlugs = React.useMemo(() => (pack?.cards ?? []).map((c) => c.slug), [pack?.cards]);

  React.useEffect(() => {
    if (!isLoggedIn) {
      setReadMap({});
      return;
    }
    if (!pack?.cards?.length) {
      setReadMap({});
      return;
    }

    let cancelled = false;
    const slugs = pack.cards.map((c) => c.slug);
    fetchMicroArticleReadStates(slugs)
      .then((res) => {
        if (cancelled) return;
        setReadMap(res.items ?? {});
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, pack?.cards]);

  const localReadIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const c of pack?.cards ?? []) {
      const p = getLessonProgress(c.id);
      if (p?.seen || p?.completed) ids.add(c.id);
    }
    return ids;
  }, [pack?.cards]);

  const resumeIndex = React.useMemo(() => {
    if (!pack?.cards?.length) return 0;
    const fromProgress = pack.progress?.last_card_id;
    if (typeof fromProgress === "number") {
      const idx = pack.cards.findIndex((c) => c.id === fromProgress);
      if (idx >= 0) return idx;
    }

    const d = readDeckFromSession();
    if (!d || d.deckId !== pack.id) return 0;
    if (!Array.isArray(d.slugs) || d.slugs.length !== deckSlugs.length) return 0;
    const safe = Math.max(0, Math.min(deckSlugs.length - 1, d.index || 0));
    return safe;
  }, [deckSlugs.length, pack?.cards, pack?.progress?.last_card_id, pack?.id]);

  const canContinue = Boolean(pack?.cards?.length) && resumeIndex > 0;

  const startAt = async (startIndex: number) => {
    if (!pack) return;
    if (!pack.cards?.length) return;

    const safeIndex = Math.max(0, Math.min(pack.cards.length - 1, startIndex));

    setStarting(true);
    setError(null);
    try {
      if (isLoggedIn) {
        await startOfficialPack(pack.id);
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, `/packs/${pack.id}`);
        window.sessionStorage.setItem(
          DECK_STORAGE_KEY,
          JSON.stringify({ slugs: deckSlugs, index: safeIndex, savedAt: Date.now(), deckId: pack.id })
        );
      }

      router.push(`/micro/${encodeURIComponent(pack.cards[safeIndex].slug)}`);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const onStart = async () => startAt(0);
  const onContinue = async () => startAt(resumeIndex);

  const onCopyPackToMyDecks = async () => {
    if (!pack) return;
    if (!isLoggedIn) return;
    if (copyLoading) return;
    setCopyLoading(true);
    setError(null);
    try {
      const res = await copyOfficialPackToUserDeck(pack.id);
      router.push(`/cards?deck=${encodeURIComponent(String(res.deck_id))}`);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setCopyLoading(false);
    }
  };

  const onAddAllToSelectedDeck = async () => {
    if (!pack) return;
    if (!isLoggedIn) return;
    if (!selectedUserDeckId) return;
    if (bulkAddLoading) return;
    setBulkAddLoading(true);
    setError(null);
    try {
      const ids = (pack.cards ?? []).map((c) => c.id);
      await bulkAddCardsToDeck(selectedUserDeckId, ids);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setBulkAddLoading(false);
    }
  };

  return (
    <MobileScaffold title={pack ? pack.name : "Pack"} contentClassName="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline">
          <Link href="/packs">Retour</Link>
        </Button>
        <div className="text-xs text-muted-foreground">#{packId}</div>
      </div>

      {error ? (
        <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">{error}</div>
      ) : null}

      {!hasLoaded || loading ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Chargement…</div>
      ) : !pack ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Pack introuvable.</div>
      ) : (
        <>
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                {coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverSrc}
                    alt="Cover"
                    className="h-full w-full max-w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold leading-snug">{pack.name}</div>
                {pack.description ? (
                  <div className="mt-1 text-sm text-muted-foreground">{pack.description}</div>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  {pack.cards_count} carte(s)
                  {pack.estimated_minutes != null ? ` · ${pack.estimated_minutes} min` : ""}
                  {pack.difficulty ? ` · ${pack.difficulty}` : ""}
                  {pack.progress ? ` · ${pack.progress.progress_pct}%` : ""}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {canContinue ? (
                <Button type="button" onClick={() => void onContinue()} disabled={starting || !pack.cards.length}>
                  {starting ? "Démarrage…" : "Continuer"}
                </Button>
              ) : (
                <Button type="button" onClick={() => void onStart()} disabled={starting || !pack.cards.length}>
                  {starting ? "Démarrage…" : "Commencer"}
                </Button>
              )}
              {canContinue ? (
                <Button type="button" variant="outline" onClick={() => void onStart()} disabled={starting || !pack.cards.length}>
                  Recommencer
                </Button>
              ) : null}
            </div>

            {!isLoggedIn ? (
              <div className="text-xs text-muted-foreground">
                Connecte-toi pour suivre la progression (start/progress).
              </div>
            ) : null}
          </div>

          {isLoggedIn ? (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="text-sm font-semibold">Ajouter aux decks</div>

              <div className="flex flex-wrap gap-2">
                {userDecks.map((d) => (
                  <Button
                    key={d.id}
                    type="button"
                    size="sm"
                    variant={selectedUserDeckId === d.id ? "default" : "outline"}
                    onClick={() => setSelectedUserDeckId(d.id)}
                    disabled={bulkAddLoading || copyLoading}
                  >
                    {d.name}{d.is_default ? " (défaut)" : ""}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onAddAllToSelectedDeck()}
                  disabled={bulkAddLoading || copyLoading || !selectedUserDeckId || !pack.cards.length}
                >
                  {bulkAddLoading ? "Ajout…" : "Ajouter toutes les cartes"}
                </Button>

                <Button
                  type="button"
                  onClick={() => void onCopyPackToMyDecks()}
                  disabled={bulkAddLoading || copyLoading || !pack.cards.length}
                >
                  {copyLoading ? "Copie…" : "Copier en deck Pack"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="text-sm font-semibold">Cartes du pack (ordre officiel)</div>
            {!pack.cards.length ? (
              <div className="text-sm text-muted-foreground">Aucune carte.</div>
            ) : (
              <div className="grid gap-2">
                {pack.cards.map((c, idx) => (
                  <MicroCard
                    key={c.id}
                    item={c}
                    deckSlugs={deckSlugs}
                    deckIndex={idx}
                    deckId={pack.id}
                    isRead={Boolean(readMap[c.slug]) || localReadIds.has(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </MobileScaffold>
  );
}
