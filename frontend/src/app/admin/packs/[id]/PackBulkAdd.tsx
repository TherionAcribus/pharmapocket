"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type PackBulkAddProps = {
  saving: boolean;
  /** Renvoie le compte-rendu à afficher, ou `null` si l'ajout a échoué. */
  onBulkAdd: (items: string) => Promise<string | null>;
};

/** Ajout en masse par coller-copier d'IDs, slugs ou URLs. */
export function PackBulkAdd({ saving, onBulkAdd }: PackBulkAddProps) {
  const [items, setItems] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);

  const submit = async () => {
    setResult(null);
    const summary = await onBulkAdd(items);
    if (summary == null) return;
    setResult(summary);
    setItems("");
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">Ajout en masse</div>
      <div className="text-xs text-muted-foreground">
        Colle des IDs, slugs ou URLs (un par ligne ou séparés par espace/virgule)
      </div>
      <textarea
        className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={items}
        onChange={(e) => setItems(e.target.value)}
        placeholder="123\nmetformine\nhttps://.../micro/metformine/"
      />
      <div className="flex gap-2">
        <Button type="button" onClick={() => void submit()} disabled={saving || !items.trim()}>
          Ajouter
        </Button>
        {result ? (
          <div className="text-xs text-muted-foreground self-center">{result}</div>
        ) : null}
      </div>
    </div>
  );
}
