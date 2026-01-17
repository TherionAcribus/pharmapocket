"use client";

import * as React from "react";
import Link from "next/link";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { fetchOfficialPacks, fetchMe } from "@/lib/api";
import type { OfficialPackSummary } from "@/lib/types";

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

export default function PacksPage() {
  const [packs, setPacks] = React.useState<OfficialPackSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchOfficialPacks();
      setPacks(rows);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
      setPacks([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

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

  return (
    <MobileScaffold title="Packs" contentClassName="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {isLoggedIn ? "Connecté" : "Mode invité"}
        </div>
        <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>
          {loading ? "Actualisation…" : "Actualiser"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">{error}</div>
      ) : null}

      {!hasLoaded || loading ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Chargement…</div>
      ) : !packs.length ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Aucun pack publié pour le moment.
        </div>
      ) : (
        <div className="grid gap-2">
          {packs.map((p) => {
            const src = normalizeImageUrl(p.cover_image_url);
            return (
              <Link
                key={p.id}
                href={`/packs/${p.id}`}
                className="rounded-xl border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="Cover" className="h-full w-full object-cover" />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold leading-snug line-clamp-2">{p.name}</div>
                    {p.description ? (
                      <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{p.description}</div>
                    ) : null}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {p.cards_count} carte(s)
                      {p.estimated_minutes != null ? ` · ${p.estimated_minutes} min` : ""}
                      {p.difficulty ? ` · ${p.difficulty}` : ""}
                      {p.progress ? ` · ${p.progress.progress_pct}%` : ""}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </MobileScaffold>
  );
}
