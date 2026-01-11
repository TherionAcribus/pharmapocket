"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FilterSheet } from "@/components/FilterSheet";
import { MicroCard } from "@/components/MicroCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchFeed, fetchMe, fetchMicroArticleReadStates } from "@/lib/api";
import type { FeedQuery } from "@/lib/api";
import type { CursorPage, MicroArticleListItem } from "@/lib/types";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function cursorFromUrl(nextUrl: string | null): string | null {
  if (!nextUrl) return null;
  try {
    const url = new URL(nextUrl);
    return url.searchParams.get("cursor");
  } catch {
    // Fallback if API returns relative URLs
    try {
      const url = new URL(nextUrl, "http://localhost");
      return url.searchParams.get("cursor");
    } catch {
      return null;
    }
  }
}

export function FeedClient({
  basePath = "/discover",
  embedded = false,
  showSearch = true,
  fetchPage = fetchFeed,
}: {
  basePath?: string;
  embedded?: boolean;
  showSearch?: boolean;
  fetchPage?: (query: FeedQuery) => Promise<CursorPage<MicroArticleListItem>>;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const queryKey = sp.toString();

  const qParam = sp.get("q") ?? "";
  const [q, setQ] = useState(qParam);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  const feedQuery = useMemo(() => {
    const tags = sp.get("tags");
    const taxonomy = sp.get("taxonomy");
    const node = sp.get("node");
    const scope = sp.get("scope");

    const taxonomyValue: FeedQuery["taxonomy"] =
      taxonomy === "pharmacologie" || taxonomy === "maladies" || taxonomy === "classes"
        ? taxonomy
        : undefined;

    const scopeValue: FeedQuery["scope"] =
      scope === "exact" || scope === "subtree" ? scope : undefined;

    return {
      q: qParam || null,
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      taxonomy: taxonomyValue,
      node: node ? Number(node) : null,
      scope: scopeValue,
    };
  }, [qParam, sp]);

  const [items, setItems] = useState<MicroArticleListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [readMap, setReadMap] = useState<Record<string, boolean>>({});

  const deckSlugs = useMemo(() => items.map((i) => i.slug), [items]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then(() => {
        if (cancelled) return;
        setIsLoggedIn(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadFirstPage() {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage({ ...feedQuery, cursor: null });
      setItems(page.results);
      setNextCursor(cursorFromUrl(page.next));
    } catch (e: unknown) {
      setError(toErrorMessage(e));
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page: CursorPage<MicroArticleListItem> = await fetchPage({
        ...feedQuery,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...page.results]);
      setNextCursor(cursorFromUrl(page.next));
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    if (!isLoggedIn) {
      setReadMap({});
      return;
    }
    if (!items.length) {
      setReadMap({});
      return;
    }

    let cancelled = false;
    const slugs = items.map((i) => i.slug);
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
  }, [isLoggedIn, items]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "600px" }
    );

    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, queryKey]);

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(sp.toString());
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    next.delete("cursor");
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const clearSearch = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete("q");
    next.delete("cursor");
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  return (
    <div className={embedded ? undefined : "min-h-screen bg-background"}>
      {!embedded ? (
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
            <div className="text-base font-semibold">PharmaPocket</div>
            <div className="flex-1" />
            <FilterSheet basePath={basePath} />
          </div>
          {showSearch ? (
            <div className="mx-auto w-full max-w-3xl px-4 pb-3">
              <form onSubmit={onSubmitSearch} className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher (ex: metformine)…"
                />
                <Button type="submit">OK</Button>
                <Button type="button" variant="outline" onClick={clearSearch}>
                  Effacer
                </Button>
              </form>
            </div>
          ) : null}
        </header>
      ) : (
        showSearch ? (
          <form onSubmit={onSubmitSearch} className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (ex: metformine)…"
            />
            <Button type="submit">OK</Button>
            <Button type="button" variant="outline" onClick={clearSearch}>
              Effacer
            </Button>
          </form>
        ) : null
      )}

      <main
        className={
          embedded ? "space-y-4" : "mx-auto w-full max-w-3xl space-y-4 px-4 py-6"
        }
      >
        {error ? (
          <div className="rounded-lg border bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : null}

        {!loading && !items.length ? (
          <div className="text-sm text-muted-foreground">Aucun résultat.</div>
        ) : null}

        <div className="space-y-3">
          {items.map((item, index) => (
            <MicroCard
              key={item.id}
              item={item}
              deckSlugs={deckSlugs}
              deckIndex={index}
              isRead={Boolean(readMap[item.slug])}
            />
          ))}
        </div>

        <div ref={sentinelRef} />

        {nextCursor ? (
          <div className="flex justify-center">
            <Button onClick={loadMore} disabled={loadingMore} variant="secondary">
              {loadingMore ? "Chargement…" : "Charger plus"}
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
