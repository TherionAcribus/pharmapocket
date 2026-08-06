"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCardDecks, useCreateDeck, useUpdateCardDecks } from "@/lib/queries";
import type { DeckMembership } from "@/lib/types";

type DeckPickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: number;
  /** Les decks n'existent que pour un compte : inutile d'interroger l'API sinon. */
  enabled: boolean;
  onError: (message: string) => void;
};

/** Choix des decks contenant la carte, avec création à la volée. */
export function DeckPickerSheet({
  open,
  onOpenChange,
  cardId,
  enabled,
  onError,
}: DeckPickerSheetProps) {
  const {
    data: cardDecks,
    isPending: loading,
    refetch: refetchCardDecks,
  } = useCardDecks(cardId, open && enabled);

  // Copie locale : les cases à cocher basculent immédiatement, la requête
  // confirme (ou la resynchronisation annule) derrière.
  const [membership, setMembership] = React.useState<DeckMembership[] | null>(null);
  React.useEffect(() => {
    if (cardDecks) setMembership(cardDecks);
  }, [cardDecks]);

  const updateCardDecksMutation = useUpdateCardDecks();
  const createDeckMutation = useCreateDeck();

  const saving = updateCardDecksMutation.isPending;
  const createLoading = createDeckMutation.isPending;

  const [createName, setCreateName] = React.useState("");

  const selectedDeckIds = React.useMemo(() => {
    if (!membership) return [] as number[];
    return membership.filter((d) => d.is_member).map((d) => d.id);
  }, [membership]);

  const toggleDeckMembership = async (deckId: number) => {
    if (!membership || saving) return;
    const next = membership.map((d) =>
      d.id === deckId ? { ...d, is_member: !d.is_member } : d
    );
    setMembership(next);

    const nextDeckIds = next.filter((d) => d.is_member).map((d) => d.id);
    try {
      await updateCardDecksMutation.mutateAsync({ cardId, deckIds: nextDeckIds });
    } catch {
      onError("Impossible de mettre à jour les decks.");
      void refetchCardDecks();
    }
  };

  const onCreateDeck = async () => {
    const name = createName.trim();
    if (!name || createLoading || saving) return;
    try {
      const created = await createDeckMutation.mutateAsync(name);
      const nextDeckIds = Array.from(new Set([...selectedDeckIds, created.id]));
      await updateCardDecksMutation.mutateAsync({ cardId, deckIds: nextDeckIds });
      setCreateName("");
    } catch {
      onError("Impossible de créer le deck.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Ajouter à un deck</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-6">
          <div className="space-y-4">
            {loading ? (
              <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                Chargement…
              </div>
            ) : membership?.length ? (
              <div className="space-y-2">
                {membership.map((d) => (
                  <div
                    key={d.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2"
                    onClick={() => void toggleDeckMembership(d.id)}
                    aria-disabled={saving}
                  >
                    <Checkbox
                      checked={d.is_member}
                      disabled={saving}
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
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Nouveau deck…"
              />
              <Button
                type="button"
                onClick={() => void onCreateDeck()}
                disabled={createLoading || saving}
              >
                Créer
              </Button>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="pt-0">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving || createLoading}
          >
            Terminé
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
