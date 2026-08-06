"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminPacks, useCreateAdminPack } from "@/lib/queries";
import { useStaffGuard } from "@/lib/staffGuard";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function AdminPacksPage() {
  const router = useRouter();
  const { checking, isStaff } = useStaffGuard();

  const { data: packs = [], isFetching: loading, error: packsError, refetch } = useAdminPacks(isStaff);
  const createPackMutation = useCreateAdminPack();

  const [createName, setCreateName] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const creating = createPackMutation.isPending;
  const error = actionError ?? (packsError ? toErrorMessage(packsError) : null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;

    setActionError(null);
    try {
      const created = await createPackMutation.mutateAsync({ name, status: "draft" });
      setCreateName("");
      router.push(`/admin/packs/${created.id}`);
    } catch (err: unknown) {
      setActionError(toErrorMessage(err));
    }
  };

  return (
    <MobileScaffold title="Admin — Packs" contentClassName="space-y-4">
      {checking ? <div className="text-sm text-muted-foreground">Vérification…</div> : null}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Créer un pack</div>
        <form className="flex gap-2" onSubmit={onCreate}>
          <Input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Nom du pack"
            disabled={creating}
          />
          <Button type="submit" disabled={creating || !createName.trim()}>
            {creating ? "Création…" : "Créer"}
          </Button>
        </form>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Packs</div>
          <Button type="button" variant="outline" onClick={() => void refetch()} disabled={loading}>
            {loading ? "Actualisation…" : "Actualiser"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">{error}</div>
        ) : null}

        {!packs.length ? (
          <div className="text-sm text-muted-foreground">Aucun pack.</div>
        ) : (
          <div className="grid gap-2">
            {packs.map((p) => (
              <Link
                key={p.id}
                href={`/admin/packs/${p.id}`}
                className="rounded-lg border bg-background px-3 py-3 hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium leading-snug">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.status} · {p.cards_count} carte(s)
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">#{p.id}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Astuce : cette page est réservée aux comptes staff (`is_staff`).
      </div>
    </MobileScaffold>
  );
}
