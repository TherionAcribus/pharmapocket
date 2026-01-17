"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { MicroCard } from "@/components/MicroCard";
import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { fetchMe, fetchOfficialPackDetail, startOfficialPack } from "@/lib/api";
import type { OfficialPackDetail } from "@/lib/types";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";
const RETURN_TO_STORAGE_KEY = "pp_reader:returnTo";

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

  const coverSrc = React.useMemo(() => normalizeImageUrl(pack?.cover_image_url), [pack?.cover_image_url]);
  const deckSlugs = React.useMemo(() => (pack?.cards ?? []).map((c) => c.slug), [pack?.cards]);

  const onStart = async () => {
    if (!pack) return;
    if (!pack.cards?.length) return;

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
          JSON.stringify({ slugs: deckSlugs, index: 0, savedAt: Date.now() })
        );
      }

      router.push(`/micro/${encodeURIComponent(pack.cards[0].slug)}`);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setStarting(false);
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

            <Button type="button" onClick={() => void onStart()} disabled={starting || !pack.cards.length}>
              {starting ? "Démarrage…" : "Commencer"}
            </Button>

            {!isLoggedIn ? (
              <div className="text-xs text-muted-foreground">
                Connecte-toi pour suivre la progression (start/progress).
              </div>
            ) : null}
          </div>

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
                    isRead={false}
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
