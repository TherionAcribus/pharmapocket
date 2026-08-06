"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAdminPackBulkAdd, useAdminPacks } from "@/lib/queries";

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Rattache les fiches qui viennent d'être importées à un pack officiel.
 *
 * L'ajout en masse accepte déjà des slugs : l'import vient précisément d'en
 * produire la liste, autant éviter le détour par la page Packs.
 */
export function AddToPack({ slugs, enabled }: { slugs: string[]; enabled: boolean }) {
  const { data: packs = [] } = useAdminPacks(enabled);
  const bulkAdd = useAdminPackBulkAdd();

  const [packId, setPackId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<{ added: number; already: number } | null>(null);

  if (!slugs.length) return null;

  const onAdd = async () => {
    setError(null);
    setAdded(null);
    try {
      const result = await bulkAdd.mutateAsync({ packId: Number(packId), input: { slugs } });
      setAdded({ added: result.added, already: result.already_present });
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">Ajouter ces fiches à un pack</div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={packId}
          onChange={(e) => setPackId(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Pack de destination"
        >
          <option value="">— choisir un pack —</option>
          {packs.map((pack) => (
            <option key={pack.id} value={String(pack.id)}>
              {pack.name} ({pack.cards_count ?? 0})
            </option>
          ))}
        </select>

        <Button type="button" onClick={() => void onAdd()} disabled={!packId || bulkAdd.isPending}>
          {bulkAdd.isPending ? "Ajout…" : `Ajouter ${slugs.length} fiche(s)`}
        </Button>

        {packId ? (
          <Button asChild variant="outline">
            <Link href={`/admin/packs/${packId}`}>Ouvrir le pack</Link>
          </Button>
        ) : null}
      </div>

      {added ? (
        <div className="text-sm text-muted-foreground">
          {added.added} fiche(s) ajoutée(s)
          {added.already ? `, ${added.already} déjà présente(s)` : ""}.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">{error}</div>
      ) : null}
    </div>
  );
}
