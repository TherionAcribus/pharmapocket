"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminUploadImage,
  adminMicroArticleSearch,
  adminPackBulkAdd,
  adminPackRemoveCard,
  adminPackReorder,
  deleteAdminPack,
  fetchAdminPack,
  fetchMe,
  fetchTags,
  fetchTaxonomyTree,
  patchAdminPack,
} from "@/lib/api";
import type {
  AdminMicroArticleSearchResult,
  AdminPackDetail,
  TagPayload,
  TaxonomyNode,
  TaxonomyTreeResponse,
} from "@/lib/types";

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

  const [coverFile, setCoverFile] = React.useState<File | null>(null);
  const [coverUploading, setCoverUploading] = React.useState(false);

  const [bulkItems, setBulkItems] = React.useState("");
  const [bulkResult, setBulkResult] = React.useState<string | null>(null);

  const [searchQ, setSearchQ] = React.useState("");
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<AdminMicroArticleSearchResult[]>([]);

  const [tagQuery, setTagQuery] = React.useState("");
  const [tagsLoading, setTagsLoading] = React.useState(false);
  const [tags, setTags] = React.useState<TagPayload[]>([]);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);

  const [themeTree, setThemeTree] = React.useState<TaxonomyTreeResponse | null>(null);
  const [medicamentTree, setMedicamentTree] = React.useState<TaxonomyTreeResponse | null>(null);
  const [pharmacologieTree, setPharmacologieTree] = React.useState<TaxonomyTreeResponse | null>(null);

  const [themeNodes, setThemeNodes] = React.useState<number[]>([]);
  const [medicamentNodes, setMedicamentNodes] = React.useState<number[]>([]);
  const [pharmacologieNodes, setPharmacologieNodes] = React.useState<number[]>([]);

  const [themeScope, setThemeScope] = React.useState<"exact" | "subtree">("subtree");
  const [medicamentScope, setMedicamentScope] = React.useState<"exact" | "subtree">("subtree");
  const [pharmacologieScope, setPharmacologieScope] = React.useState<"exact" | "subtree">("subtree");

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const coverImageSrc = React.useMemo(() => {
    const raw = pack?.cover_image_url;
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base =
      process.env.NEXT_PUBLIC_MEDIA_BASE ||
      process.env.NEXT_PUBLIC_API_BASE ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const normalizedBase =
      base && base.includes(":3000") ? base.replace(":3000", ":8000") : base;
    try {
      return new URL(raw, normalizedBase).toString();
    } catch {
      return raw;
    }
  }, [pack?.cover_image_url]);

  React.useEffect(() => {
    let cancelled = false;
    setTagsLoading(true);
    fetchTags(tagQuery, 100)
      .then((rows) => {
        if (cancelled) return;
        setTags(rows);
      })
      .finally(() => {
        if (cancelled) return;
        setTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tagQuery]);

  React.useEffect(() => {
    let cancelled = false;
    fetchTaxonomyTree("theme")
      .then((t) => {
        if (cancelled) return;
        setThemeTree(t);
      })
      .catch(() => {
        if (cancelled) return;
        setThemeTree(null);
      });
    fetchTaxonomyTree("medicament")
      .then((t) => {
        if (cancelled) return;
        setMedicamentTree(t);
      })
      .catch(() => {
        if (cancelled) return;
        setMedicamentTree(null);
      });
    fetchTaxonomyTree("pharmacologie")
      .then((t) => {
        if (cancelled) return;
        setPharmacologieTree(t);
      })
      .catch(() => {
        if (cancelled) return;
        setPharmacologieTree(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const onUploadCover = async () => {
    if (!coverFile) {
      setError("Choisis d’abord un fichier image avant de cliquer sur Uploader.");
      return;
    }
    setCoverUploading(true);
    setError(null);
    try {
      const uploaded = await adminUploadImage({ file: coverFile, title: `Pack ${packId} cover` });
      setCoverImageId(String(uploaded.id));
      await patchAdminPack(packId, { cover_image_id: uploaded.id });
      await reload();
      setCoverFile(null);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setCoverUploading(false);
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
    setSearchLoading(true);
    try {
      const res = await adminMicroArticleSearch({
        q: searchQ,
        tags: selectedTags,
        theme_nodes: themeNodes,
        theme_scope: themeScope,
        medicament_nodes: medicamentNodes,
        medicament_scope: medicamentScope,
        pharmacologie_nodes: pharmacologieNodes,
        pharmacologie_scope: pharmacologieScope,
      });
      setSearchResults(res);
      if (!res.length) {
        // keep quiet; UI already shows "Aucun résultat"
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const toggleTag = (slug: string) => {
    setSelectedTags((prev) => {
      const set = new Set(prev);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      return Array.from(set);
    });
  };

  const toggleNode = (id: number, setState: React.Dispatch<React.SetStateAction<number[]>>) => {
    setState((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const TaxonomyMultiTree = ({
    nodes,
    selected,
    onToggle,
    depth = 0,
  }: {
    nodes: TaxonomyNode[];
    selected: number[];
    onToggle: (id: number) => void;
    depth?: number;
  }) => {
    return (
      <div className="space-y-1">
        {nodes.map((n) => (
          <div key={n.id} className="space-y-1">
            <label className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${depth * 12}px` }}>
              <input
                type="checkbox"
                checked={selected.includes(n.id)}
                onChange={() => onToggle(n.id)}
              />
              <span className="truncate">{n.name}</span>
            </label>
            {n.children?.length ? (
              <div className="ml-4 border-l pl-2">
                <TaxonomyMultiTree
                  nodes={n.children}
                  selected={selected}
                  onToggle={onToggle}
                  depth={depth + 1}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
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
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Cover image id</div>
              <Input value={coverImageId} onChange={(e) => setCoverImageId(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Upload cover</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={coverUploading}
                onClick={() => void onUploadCover()}
              >
                {coverUploading ? "Upload…" : "Uploader et associer"}
              </Button>
              <div className="text-xs text-muted-foreground self-center truncate">
                {coverFile ? coverFile.name : "Aucun fichier sélectionné"}
              </div>
            </div>
          </div>

          {coverImageSrc ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Cover actuelle</div>
              <div className="inline-block rounded-md border bg-background p-2">
                <img
                  src={coverImageSrc}
                  alt="Cover pack"
                  className="h-32 w-32 object-cover rounded"
                />
              </div>
              <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                {coverImageSrc}
              </div>
            </div>
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

        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Texte (optionnel)…" />
            <Button type="button" variant="outline" onClick={() => void onSearch()} disabled={searchLoading}>
              {searchLoading ? "…" : "Rechercher"}
            </Button>
          </div>

          <div className="rounded-md border bg-background p-3 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">Filtres (AND entre blocs)</div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Tags</div>
              <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Filtrer tags…" />
              {tagsLoading ? <div className="text-xs text-muted-foreground">Chargement…</div> : null}
              <div className="max-h-40 overflow-auto rounded border p-2 space-y-1">
                {tags.slice(0, 80).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(t.slug)}
                      onChange={() => toggleTag(t.slug)}
                    />
                    <span className="truncate">{t.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t.slug}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Thème</div>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={themeScope}
                    onChange={(e) => setThemeScope(e.target.value as "exact" | "subtree")}
                  >
                    <option value="subtree">subtree</option>
                    <option value="exact">exact</option>
                  </select>
                </div>
                <div className="max-h-56 overflow-auto rounded border p-2">
                  {themeTree?.tree?.length ? (
                    <TaxonomyMultiTree
                      nodes={themeTree.tree}
                      selected={themeNodes}
                      onToggle={(id) => toggleNode(id, setThemeNodes)}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">Aucun arbre.</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Médicament</div>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={medicamentScope}
                    onChange={(e) => setMedicamentScope(e.target.value as "exact" | "subtree")}
                  >
                    <option value="subtree">subtree</option>
                    <option value="exact">exact</option>
                  </select>
                </div>
                <div className="max-h-56 overflow-auto rounded border p-2">
                  {medicamentTree?.tree?.length ? (
                    <TaxonomyMultiTree
                      nodes={medicamentTree.tree}
                      selected={medicamentNodes}
                      onToggle={(id) => toggleNode(id, setMedicamentNodes)}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">Aucun arbre.</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Pharmacologie</div>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={pharmacologieScope}
                    onChange={(e) => setPharmacologieScope(e.target.value as "exact" | "subtree")}
                  >
                    <option value="subtree">subtree</option>
                    <option value="exact">exact</option>
                  </select>
                </div>
                <div className="max-h-56 overflow-auto rounded border p-2">
                  {pharmacologieTree?.tree?.length ? (
                    <TaxonomyMultiTree
                      nodes={pharmacologieTree.tree}
                      selected={pharmacologieNodes}
                      onToggle={(id) => toggleNode(id, setPharmacologieNodes)}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">Aucun arbre.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
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
