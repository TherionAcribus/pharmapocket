"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FilterSheet } from "@/components/FilterSheet";
import { MicroCard } from "@/components/MicroCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeed, useMe, useReadStates, type FeedSource } from "@/lib/queries";
import type { FeedQuery } from "@/lib/api/feed";

export function FeedClient({
  basePath = "/discover",
  embedded = false,
  showSearch = true,
  source = "content",
}: {
  basePath?: string;
  embedded?: boolean;
  showSearch?: boolean;
  source?: FeedSource;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const qParam = sp.get("q") ?? "";
  const [q, setQ] = useState(qParam);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  const feedQuery = useMemo<FeedQuery>(() => {
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

  const {
    data,
    error,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useFeed(source, feedQuery);

  const items = useMemo(() => data?.pages.flatMap((page) => page.results) ?? [], [data]);
  const deckSlugs = useMemo(() => items.map((i) => i.slug), [items]);

  const { data: me } = useMe();
  const { data: readStates } = useReadStates(deckSlugs, Boolean(me));
  const readMap = readStates?.items ?? {};

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
            {error.message}
          </div>
        ) : null}

        {isPending ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : null}

        {!isPending && !items.length ? (
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

        {hasNextPage ? (
          <div className="flex justify-center">
            <Button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="secondary"
            >
              {isFetchingNextPage ? "Chargement…" : "Charger plus"}
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
