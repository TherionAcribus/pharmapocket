"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { AdminPackDetail } from "@/lib/types";

type PackCards = AdminPackDetail["cards"];

type PackCardsListProps = {
  cards: PackCards | undefined;
  saving: boolean;
  onSaveOrder: (cardIds: number[]) => Promise<void>;
  onRemove: (cardId: number) => Promise<void>;
};

/** Cartes du pack, réordonnables au drag & drop avant envoi. */
export function PackCardsList({ cards, saving, onSaveOrder, onRemove }: PackCardsListProps) {
  // L'ordre est manipulé localement avant d'être posté : il repart du serveur
  // à chaque rechargement du pack.
  const [orderedCards, setOrderedCards] = React.useState<PackCards>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    setOrderedCards(cards ?? []);
  }, [cards]);

  const moveCard = (from: number, to: number) => {
    if (from === to) return;
    setOrderedCards((prev) => {
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Cartes du pack</div>
          <div className="text-xs text-muted-foreground">
            Drag & drop puis “Sauvegarder l’ordre”
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void onSaveOrder(orderedCards.map((c) => c.id))}
          disabled={saving || !orderedCards.length}
        >
          Sauvegarder l’ordre
        </Button>
      </div>

      {!orderedCards.length ? (
        <div className="text-sm text-muted-foreground">Aucune carte.</div>
      ) : (
        <div className="grid gap-2">
          {orderedCards.map((c, idx) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={() => {
                if (dragIndex == null) return;
                moveCard(dragIndex, idx);
                setDragIndex(null);
              }}
              className="flex items-start justify-between gap-2 rounded-md border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  <span className="mr-2 text-xs text-muted-foreground">{idx + 1}.</span>
                  {c.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.slug} · #{c.id}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onRemove(c.id)}
                disabled={saving}
              >
                Retirer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
