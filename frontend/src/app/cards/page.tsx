"use client";

import * as React from "react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { MicroCard } from "@/components/MicroCard";
import { fetchMe, fetchSavedMicroArticles } from "@/lib/api";
import type { MicroArticleListItem } from "@/lib/types";

export default function CardsPage() {
  const [items, setItems] = React.useState<MicroArticleListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

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
        // continue
      });

    fetchSavedMicroArticles()
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setItems([]);
        setError(e instanceof Error ? e.message : "Erreur");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const deckSlugs = React.useMemo(() => items.map((i) => i.slug), [items]);

  return (
    <MobileScaffold title="Mes cartes">
      {loading ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Chargement…</div>
      ) : !isLoggedIn ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Connecte-toi pour voir tes cartes sauvegardées.
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Erreur lors du chargement.
        </div>
      ) : items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <MicroCard key={item.id} item={item} deckSlugs={deckSlugs} deckIndex={index} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Aucune carte sauvegardée pour le moment.
        </div>
      )}
    </MobileScaffold>
  );
}
