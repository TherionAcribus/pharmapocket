"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminPack, fetchAdminPacks, fetchMe } from "@/lib/api";
import type { AdminPackSummary } from "@/lib/types";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function AdminPacksPage() {
  const router = useRouter();

  const [checking, setChecking] = React.useState(true);
  const [packs, setPacks] = React.useState<AdminPackSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [createName, setCreateName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminPacks();
      setPacks(rows);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.is_staff) {
          router.replace("/discover");
          return;
        }
        void reload();
      })
      .catch(() => {
        if (cancelled) return;
        router.replace("/account/login");
      })
      .finally(() => {
        if (cancelled) return;
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reload, router]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);
    try {
      const created = await createAdminPack({ name, status: "draft" });
      setCreateName("");
      router.push(`/admin/packs/${created.id}`);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setCreating(false);
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
          <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>
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
