"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminMicroArticleSearch,
  adminPackBulkAdd,
  adminPackRemoveCard,
  adminPackReorder,
  deleteAdminPack,
  fetchAdminPack,
  fetchMe,
  patchAdminPack,
} from "@/lib/api";
import type { AdminMicroArticleSearchResult, AdminPackDetail } from "@/lib/types";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function clampIntOrNull(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export default function AdminPackDetailPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const packId = Number(routeParams?.id);

  const [checking, setChecking] = React.useState(true);

  const [pack, setPack] = React.useState<AdminPackDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [estimatedMinutes, setEstimatedMinutes] = React.useState<string>("");
  const [status, setStatus] = React.useState("draft");
  const [coverImageId, setCoverImageId] = React.useState<string>("");

  const [bulkItems, setBulkItems] = React.useState("");
  const [bulkResult, setBulkResult] = React.useState<string | null>(null);

  const [searchQ, setSearchQ] = React.useState("");
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<AdminMicroArticleSearchResult[]>([]);

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const reload = React.useCallback(async () => {
    if (!Number.isFinite(packId)) return;
    setLoading(true);
    setError(null);
    try {
      const p = await fetchAdminPack(packId);
      setPack(p);
      setName(p.name);
      setDescription(p.description || "");
      setDifficulty(p.difficulty || "");
      setEstimatedMinutes(p.estimated_minutes != null ? String(p.estimated_minutes) : "");
      setStatus(p.status || "draft");
      setCoverImageId(p.cover_image?.id != null ? String(p.cover_image.id) : "");
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [packId]);

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

  const onSaveMeta = async () => {
    if (!Number.isFinite(packId)) return;
    setSaving(true);
    setError(null);
    try {
      await patchAdminPack(packId, {
        name: name.trim(),
        description,
        difficulty,
        estimated_minutes: clampIntOrNull(estimatedMinutes),
        status,
        cover_image_id: clampIntOrNull(coverImageId),
      });
      await reload();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onBulkAdd = async () => {
    if (!Number.isFinite(packId)) return;
    setSaving(true);
    setError(null);
    setBulkResult(null);
    try {
      const res = await adminPackBulkAdd(packId, { items: bulkItems });
      setBulkResult(`Ajoutées: ${res.added}, déjà présentes: ${res.already_present}, introuvables: ${res.not_found}`);
      setBulkItems("");
      await reload();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onSearch = async () => {
    const q = searchQ.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await adminMicroArticleSearch(q);
      setSearchResults(res);
    } finally {
      setSearchLoading(false);
    }
  };

  const onAddOne = async (id: number) => {
    if (!Number.isFinite(packId)) return;
    setSaving(true);
    setError(null);
    try {
      await adminPackBulkAdd(packId, { microarticle_ids: [id] });
      await reload();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async (id: number) => {
    if (!Number.isFinite(packId)) return;
    setSaving(true);
    setError(null);
    try {
      await adminPackRemoveCard(packId, id);
      await reload();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const moveCard = (from: number, to: number) => {
    if (!pack) return;
    if (from === to) return;
    const next = pack.cards.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPack({ ...pack, cards: next });
  };

  const onSaveOrder = async () => {
    if (!Number.isFinite(packId) || !pack) return;
    setSaving(true);
    setError(null);
    try {
      const ids = pack.cards.map((c) => c.id);
      await adminPackReorder(packId, ids);
      await reload();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onDeletePack = async () => {
    if (!Number.isFinite(packId)) return;
    if (!confirm("Supprimer ce pack ?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAdminPack(packId);
      router.replace("/admin/packs");
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileScaffold title="Admin — Pack" contentClassName="space-y-4">
      {checking ? <div className="text-sm text-muted-foreground">Vérification…</div> : null}

      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline">
          <Link href="/admin/packs">Retour</Link>
        </Button>
        <div className="text-xs text-muted-foreground">#{packId}</div>
      </div>

      {error ? (
        <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Métadonnées</div>
            <div className="text-xs text-muted-foreground">Packs officiels (admin-only)</div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading || saving}>
              {loading ? "Chargement…" : "Recharger"}
            </Button>
            <Button type="button" onClick={() => void onSaveMeta()} disabled={saving}>
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="space-y-1">
            <div className="text-sm font-medium">Nom</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Description</div>
            <textarea
              className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">Difficulté</div>
              <Input value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="beginner / …" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Minutes estimées</div>
              <Input value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">Statut</div>
              <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="draft/published" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Cover image id</div>
              <Input value={coverImageId} onChange={(e) => setCoverImageId(e.target.value)} />
            </div>
          </div>

          {pack?.cover_image_url ? (
            <div className="text-xs text-muted-foreground">Cover actuelle: {pack.cover_image_url}</div>
          ) : null}
        </div>

        <div className="pt-2">
          <Button type="button" variant="destructive" onClick={() => void onDeletePack()} disabled={saving}>
            Supprimer le pack
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Ajout en masse</div>
        <div className="text-xs text-muted-foreground">Colle des IDs, slugs ou URLs (un par ligne ou séparés par espace/virgule)</div>
        <textarea
          className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={bulkItems}
          onChange={(e) => setBulkItems(e.target.value)}
          placeholder="123\nmetformine\nhttps://.../micro/metformine/"
        />
        <div className="flex gap-2">
          <Button type="button" onClick={() => void onBulkAdd()} disabled={saving || !bulkItems.trim()}>
            Ajouter
          </Button>
          {bulkResult ? <div className="text-xs text-muted-foreground self-center">{bulkResult}</div> : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Recherche + ajout</div>
        <div className="flex gap-2">
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Rechercher une carte…" />
          <Button type="button" variant="outline" onClick={() => void onSearch()} disabled={searchLoading}>
            {searchLoading ? "…" : "Rechercher"}
          </Button>
        </div>

        {searchResults.length ? (
          <div className="grid gap-2">
            {searchResults.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.slug} · #{r.id}</div>
                </div>
                <Button type="button" onClick={() => void onAddOne(r.id)} disabled={saving}>
                  Ajouter
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Aucun résultat.</div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Cartes du pack</div>
            <div className="text-xs text-muted-foreground">Drag & drop puis “Sauvegarder l’ordre”</div>
          </div>
          <Button type="button" onClick={() => void onSaveOrder()} disabled={saving || !pack?.cards?.length}>
            Sauvegarder l’ordre
          </Button>
        </div>

        {!pack?.cards?.length ? (
          <div className="text-sm text-muted-foreground">Aucune carte.</div>
        ) : (
          <div className="grid gap-2">
            {pack.cards.map((c, idx) => (
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
                  <div className="text-xs text-muted-foreground">{c.slug} · #{c.id}</div>
                </div>
                <Button type="button" variant="outline" onClick={() => void onRemove(c.id)} disabled={saving}>
                  Retirer
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Note: la liste compacte + drag&drop est volontairement simple (HTML5 DnD). On pourra la rendre plus puissante ensuite.
      </div>
    </MobileScaffold>
  );
}
