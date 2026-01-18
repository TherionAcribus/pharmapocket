"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { MobileScaffold } from "@/components/MobileScaffold";
import { MicroCard } from "@/components/MicroCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  createDeck,
  deleteDeck,
  fetchDeckCards,
  fetchDecks,
  fetchMe,
  patchDeck,
  removeCardFromDeck,
} from "@/lib/api";
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

  const [deckActionLoading, setDeckActionLoading] = React.useState(false);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedCardIds, setSelectedCardIds] = React.useState<number[]>([]);

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);

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

  const selectedCardIdsSet = React.useMemo(() => new Set(selectedCardIds), [selectedCardIds]);

  React.useEffect(() => {
    setSelectedCardIds([]);
    setSelectMode(false);
    setRenameOpen(false);
    setDeleteOpen(false);
    setRemoveOpen(false);
  }, [selectedDeckId]);

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

  const reloadDecks = React.useCallback(async () => {
    const nextDecks = await fetchDecks();
    setDecks(nextDecks);
    return nextDecks;
  }, []);

  const reloadSelectedDeckCards = React.useCallback(async () => {
    if (!selectedDeckId) {
      setItems([]);
      return;
    }
    const res = await fetchDeckCards(selectedDeckId);
    setItems(res.results);
  }, [selectedDeckId]);

  const onRenameSelectedDeck = () => {
    if (!selectedDeck) return;
    setRenameValue(selectedDeck.name);
    setRenameOpen(true);
  };

  const onConfirmRenameSelectedDeck = async () => {
    if (!selectedDeck) return;
    if (deckActionLoading) return;
    const nextName = renameValue.trim();
    if (!nextName) return;

    setDeckActionLoading(true);
    try {
      await patchDeck(selectedDeck.id, { name: nextName });
      await reloadDecks();
      setError(null);
      setRenameOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeckActionLoading(false);
    }
  };

  const onDeleteSelectedDeck = () => {
    if (!selectedDeck) return;
    if (selectedDeck.is_default) return;
    setDeleteOpen(true);
  };

  const onConfirmDeleteSelectedDeck = async () => {
    if (!selectedDeck) return;
    if (selectedDeck.is_default) return;
    if (deckActionLoading) return;

    setDeckActionLoading(true);
    try {
      await deleteDeck(selectedDeck.id);
      const nextDecks = await reloadDecks();
      const nextDefault = nextDecks.find((d) => d.is_default) ?? nextDecks[0] ?? null;
      setSelectedDeckId(nextDefault ? nextDefault.id : null);
      setError(null);
      setDeleteOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeckActionLoading(false);
    }
  };

  const onToggleSelectedCard = (cardId: number, next: boolean) => {
    setSelectedCardIds((prev) => {
      const has = prev.includes(cardId);
      if (next && !has) return [...prev, cardId];
      if (!next && has) return prev.filter((id) => id !== cardId);
      return prev;
    });
  };

  const onRemoveSelectedCards = () => {
    if (!selectedDeckId) return;
    if (!selectedCardIds.length) return;
    setRemoveOpen(true);
  };

  const onConfirmRemoveSelectedCards = async () => {
    if (!selectedDeckId) return;
    if (!selectedCardIds.length) return;
    if (deckActionLoading) return;

    setDeckActionLoading(true);
    try {
      await Promise.all(selectedCardIds.map((id) => removeCardFromDeck(selectedDeckId, id)));
      await reloadSelectedDeckCards();
      await reloadDecks();
      setSelectedCardIds([]);
      setError(null);
      setRemoveOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeckActionLoading(false);
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
                  {d.name}{d.source_pack_id ? " (Pack)" : ""} ({d.cards_count})
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

          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold flex-1 min-w-0">
                {selectedDeck ? selectedDeck.name : "Deck"}
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onRenameSelectedDeck()}
                disabled={!selectedDeck || deckActionLoading}
              >
                Renommer
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onDeleteSelectedDeck()}
                disabled={!selectedDeck || selectedDeck.is_default || deckActionLoading}
              >
                Supprimer
              </Button>
            </div>

            <Separator className="my-4" />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={selectMode ? "default" : "outline"}
                onClick={() => {
                  setSelectMode((v) => {
                    const next = !v;
                    if (!next) setSelectedCardIds([]);
                    return next;
                  });
                }}
                disabled={!items.length}
              >
                {selectMode ? "Annuler" : "Sélectionner"}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedCardIds((prev) => {
                    if (prev.length === items.length) return [];
                    return items.map((i) => i.id);
                  });
                }}
                disabled={!selectMode || !items.length}
              >
                Tout
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => void onRemoveSelectedCards()}
                disabled={!selectMode || !selectedCardIds.length || deckActionLoading}
              >
                Retirer ({selectedCardIds.length})
              </Button>
            </div>
          </div>

          <DialogPrimitive.Root open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
              <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-4 shadow-lg">
                <DialogPrimitive.Title className="text-base font-semibold">
                  Renommer le deck
                </DialogPrimitive.Title>
                <div className="mt-3 space-y-3">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="Nom du deck…"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onConfirmRenameSelectedDeck();
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <DialogPrimitive.Close asChild>
                      <Button type="button" variant="outline" disabled={deckActionLoading}>
                        Annuler
                      </Button>
                    </DialogPrimitive.Close>
                    <Button
                      type="button"
                      onClick={() => void onConfirmRenameSelectedDeck()}
                      disabled={deckActionLoading || !renameValue.trim()}
                    >
                      Enregistrer
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          <DialogPrimitive.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
              <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-4 shadow-lg">
                <DialogPrimitive.Title className="text-base font-semibold">
                  Supprimer le deck
                </DialogPrimitive.Title>
                <div className="mt-2 text-sm text-muted-foreground">
                  {selectedDeck ? `Supprimer le deck "${selectedDeck.name}" ?` : "Supprimer ce deck ?"}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="outline" disabled={deckActionLoading}>
                      Annuler
                    </Button>
                  </DialogPrimitive.Close>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void onConfirmDeleteSelectedDeck()}
                    disabled={deckActionLoading || !selectedDeck || selectedDeck.is_default}
                  >
                    Supprimer
                  </Button>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          <DialogPrimitive.Root open={removeOpen} onOpenChange={setRemoveOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
              <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-4 shadow-lg">
                <DialogPrimitive.Title className="text-base font-semibold">
                  Retirer des cartes
                </DialogPrimitive.Title>
                <div className="mt-2 text-sm text-muted-foreground">
                  Retirer {selectedCardIds.length} carte(s) du deck {selectedDeck ? `"${selectedDeck.name}"` : "sélectionné"} ?
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="outline" disabled={deckActionLoading}>
                      Annuler
                    </Button>
                  </DialogPrimitive.Close>
                  <Button
                    type="button"
                    onClick={() => void onConfirmRemoveSelectedCards()}
                    disabled={deckActionLoading || !selectedCardIds.length}
                  >
                    Retirer
                  </Button>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          {items.length ? (
            <div className="space-y-3">
              {items.map((item, index) => (
                <MicroCard
                  key={item.id}
                  item={item}
                  deckSlugs={selectMode ? undefined : deckSlugs}
                  deckIndex={selectMode ? undefined : index}
                  selectMode={selectMode}
                  selected={selectedCardIdsSet.has(item.id)}
                  onSelectedChange={(next) => onToggleSelectedCard(item.id, next)}
                />
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
