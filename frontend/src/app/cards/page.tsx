"use client";

import * as React from "react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { MicroCard } from "@/components/MicroCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { fetchDeckCards, fetchDecks, fetchMe, createDeck } from "@/lib/api";
import type { DeckSummary, MicroArticleListItem } from "@/lib/types";

export default function CardsPage() {
  const [decks, setDecks] = React.useState<DeckSummary[]>([]);
  const [selectedDeckId, setSelectedDeckId] = React.useState<number | null>(null);
  const [items, setItems] = React.useState<MicroArticleListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newDeckName, setNewDeckName] = React.useState<string>("");
  const [isCreatingDeck, setIsCreatingDeck] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    setLoading(true);
    fetchMe()
      .then(() => {
        if (cancelled) return;
        setIsLoggedIn(true);
        return fetchDecks()
          .then((rows) => {
            if (cancelled) return;
            setDecks(rows);
            const defaultDeck = rows.find((d) => d.is_default) ?? rows[0] ?? null;
            setSelectedDeckId(defaultDeck ? defaultDeck.id : null);
            setError(null);
          })
          .catch((e) => {
            if (cancelled) return;
            setDecks([]);
            setSelectedDeckId(null);
            setError(e instanceof Error ? e.message : "Erreur");
          });
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoggedIn(false);
        setDecks([]);
        setSelectedDeckId(null);
        setError(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    if (!selectedDeckId) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchDeckCards(selectedDeckId)
      .then((res) => {
        if (cancelled) return;
        setItems(res.results);
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
  }, [isLoggedIn, selectedDeckId]);

  const deckSlugs = React.useMemo(() => items.map((i) => i.slug), [items]);

  const selectedDeck = React.useMemo(
    () => (selectedDeckId ? decks.find((d) => d.id === selectedDeckId) ?? null : null),
    [decks, selectedDeckId]
  );

  const onCreateDeck = async () => {
    if (!newDeckName.trim() || isCreatingDeck) return;
    setIsCreatingDeck(true);
    try {
      await createDeck(newDeckName.trim());
      const nextDecks = await fetchDecks();
      setDecks(nextDecks);
      const created = nextDecks.find((d) => d.name === newDeckName.trim()) ?? null;
      if (created) setSelectedDeckId(created.id);
      setNewDeckName("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setIsCreatingDeck(false);
    }
  };

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
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Decks</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {decks.map((d) => (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={selectedDeckId === d.id ? "default" : "outline"}
                  onClick={() => setSelectedDeckId(d.id)}
                >
                  {d.name} ({d.cards_count})
                </Button>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="flex gap-2">
              <Input
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="Nouveau deck…"
              />
              <Button type="button" onClick={() => void onCreateDeck()} disabled={isCreatingDeck}>
                Créer
              </Button>
            </div>
          </div>

          <div className="text-sm font-semibold">
            {selectedDeck ? selectedDeck.name : "Deck"}
          </div>

          {items.length ? (
            <div className="space-y-3">
              {items.map((item, index) => (
                <MicroCard key={item.id} item={item} deckSlugs={deckSlugs} deckIndex={index} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              Aucune carte dans ce deck.
            </div>
          )}
        </div>
      )}
    </MobileScaffold>
  );
}
