"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAdminMicroArticleSearch,
  useAdminPack,
  useAdminPackBulkAdd,
  useAdminPackRemoveCard,
  useAdminPackReorder,
  useAdminUploadImage,
  useDeleteAdminPack,
  usePatchAdminPack,
  useTags,
  useTaxonomyTree,
} from "@/lib/queries";
import { useStaffGuard } from "@/lib/staffGuard";
import type { AdminPackDetail, TaxonomyNode } from "@/lib/types";

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

  const { checking, isStaff } = useStaffGuard();

  const {
    data: pack,
    isFetching: loading,
    error: packError,
    refetch: reload,
  } = useAdminPack(packId, isStaff);

  const patchPackMutation = usePatchAdminPack();
  const deletePackMutation = useDeleteAdminPack();
  const bulkAddMutation = useAdminPackBulkAdd();
  const removeCardMutation = useAdminPackRemoveCard();
  const reorderMutation = useAdminPackReorder();
  const uploadImageMutation = useAdminUploadImage();
  const searchMutation = useAdminMicroArticleSearch();

  const [actionError, setActionError] = React.useState<string | null>(null);
  const error = actionError ?? (packError ? toErrorMessage(packError) : null);

  const saving =
    patchPackMutation.isPending ||
    deletePackMutation.isPending ||
    bulkAddMutation.isPending ||
    removeCardMutation.isPending ||
    reorderMutation.isPending;

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [estimatedMinutes, setEstimatedMinutes] = React.useState<string>("");
  const [status, setStatus] = React.useState("draft");
  const [coverImageId, setCoverImageId] = React.useState<string>("");

  const [coverFile, setCoverFile] = React.useState<File | null>(null);
  const coverUploading = uploadImageMutation.isPending;

  const [bulkItems, setBulkItems] = React.useState("");
  const [bulkResult, setBulkResult] = React.useState<string | null>(null);

  const [searchQ, setSearchQ] = React.useState("");
  const [searchRecent, setSearchRecent] = React.useState(false);
  const searchLoading = searchMutation.isPending;
  const searchResults = searchMutation.data ?? [];
  const [optimisticAddedIds, setOptimisticAddedIds] = React.useState<number[]>([]);

  const [tagQuery, setTagQuery] = React.useState("");
  const { data: tags = [], isPending: tagsLoading } = useTags(tagQuery, 100);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);

  const { data: themeTree } = useTaxonomyTree("theme");
  const { data: medicamentTree } = useTaxonomyTree("medicament");
  const { data: maladiesTree } = useTaxonomyTree("maladies");
  const { data: pharmacologieTree } = useTaxonomyTree("pharmacologie");

  const [themeNodes, setThemeNodes] = React.useState<number[]>([]);
  const [medicamentNodes, setMedicamentNodes] = React.useState<number[]>([]);
  const [maladiesNodes, setMaladiesNodes] = React.useState<number[]>([]);
  const [pharmacologieNodes, setPharmacologieNodes] = React.useState<number[]>([]);

  const [themeScope, setThemeScope] = React.useState<"exact" | "subtree">("subtree");
  const [medicamentScope, setMedicamentScope] = React.useState<"exact" | "subtree">("subtree");
  const [maladiesScope, setMaladiesScope] = React.useState<"exact" | "subtree">("subtree");
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

  // L'ordre est manipulé localement (drag & drop) avant d'être posté :
  // il repart du serveur à chaque rechargement du pack.
  const [orderedCards, setOrderedCards] = React.useState<AdminPackDetail["cards"]>([]);

  React.useEffect(() => {
    if (!pack) return;
    setOrderedCards(pack.cards);
    setOptimisticAddedIds([]);
    setName(pack.name);
    setDescription(pack.description || "");
    setDifficulty(pack.difficulty || "");
    setEstimatedMinutes(pack.estimated_minutes != null ? String(pack.estimated_minutes) : "");
    setStatus(pack.status || "draft");
    setCoverImageId(pack.cover_image?.id != null ? String(pack.cover_image.id) : "");
  }, [pack]);

  const onSaveMeta = async () => {
    if (!Number.isFinite(packId)) return;
    setActionError(null);
    try {
      await patchPackMutation.mutateAsync({
        packId,
        input: {
          name: name.trim(),
          description,
          difficulty,
          estimated_minutes: clampIntOrNull(estimatedMinutes),
          status,
          cover_image_id: clampIntOrNull(coverImageId),
        },
      });
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const onUploadCover = async () => {
    if (!coverFile) {
      setActionError("Choisis d’abord un fichier image avant de cliquer sur Uploader.");
      return;
    }
    setActionError(null);
    try {
      const uploaded = await uploadImageMutation.mutateAsync({
        file: coverFile,
        title: `Pack ${packId} cover`,
      });
      setCoverImageId(String(uploaded.id));
      await patchPackMutation.mutateAsync({ packId, input: { cover_image_id: uploaded.id } });
      setCoverFile(null);
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const onBulkAdd = async () => {
    if (!Number.isFinite(packId)) return;
    setActionError(null);
    setBulkResult(null);
    try {
      const res = await bulkAddMutation.mutateAsync({ packId, input: { items: bulkItems } });
      setBulkResult(`Ajoutées: ${res.added}, déjà présentes: ${res.already_present}, introuvables: ${res.not_found}`);
      setBulkItems("");
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const onSearch = () => {
    searchMutation.mutate({
      q: searchQ,
      recent: searchRecent,
      tags: selectedTags,
      theme_nodes: themeNodes,
      theme_scope: themeScope,
      maladies_nodes: maladiesNodes,
      maladies_scope: maladiesScope,
      medicament_nodes: medicamentNodes,
      medicament_scope: medicamentScope,
      pharmacologie_nodes: pharmacologieNodes,
      pharmacologie_scope: pharmacologieScope,
    });
  };

  const inCurrentPackIds = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of pack?.cards ?? []) set.add(c.id);
    for (const id of optimisticAddedIds) set.add(id);
    return set;
  }, [pack?.cards, optimisticAddedIds]);

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
    if (inCurrentPackIds.has(id)) return;
    setActionError(null);
    setOptimisticAddedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await bulkAddMutation.mutateAsync({ packId, input: { microarticle_ids: [id] } });
    } catch (e: unknown) {
      setOptimisticAddedIds((prev) => prev.filter((x) => x !== id));
      setActionError(toErrorMessage(e));
    }
  };

  const onRemove = async (id: number) => {
    if (!Number.isFinite(packId)) return;
    setActionError(null);
    try {
      await removeCardMutation.mutateAsync({ packId, cardId: id });
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const moveCard = (from: number, to: number) => {
    if (from === to) return;
    setOrderedCards((prev) => {
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const onSaveOrder = async () => {
    if (!Number.isFinite(packId) || !orderedCards.length) return;
    setActionError(null);
    try {
      await reorderMutation.mutateAsync({
        packId,
        cardIds: orderedCards.map((c) => c.id),
      });
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const onDeletePack = async () => {
    if (!Number.isFinite(packId)) return;
    if (!confirm("Supprimer ce pack ?")) return;
    setActionError(null);
    try {
      await deletePackMutation.mutateAsync(packId);
      router.replace("/admin/packs");
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
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
            <label className="flex items-center gap-2 rounded-md border bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={searchRecent}
                onChange={(e) => setSearchRecent(e.target.checked)}
              />
              <span>Dernières</span>
            </label>
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

            <div className="grid gap-3 md:grid-cols-4">
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
                  <div className="text-sm font-medium">Maladies</div>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={maladiesScope}
                    onChange={(e) => setMaladiesScope(e.target.value as "exact" | "subtree")}
                  >
                    <option value="subtree">subtree</option>
                    <option value="exact">exact</option>
                  </select>
                </div>
                <div className="max-h-56 overflow-auto rounded border p-2">
                  {maladiesTree?.tree?.length ? (
                    <TaxonomyMultiTree
                      nodes={maladiesTree.tree}
                      selected={maladiesNodes}
                      onToggle={(id) => toggleNode(id, setMaladiesNodes)}
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
                  <div className="text-xs text-muted-foreground">
                    {r.slug} · #{r.id}
                    {(() => {
                      const inThisPack = inCurrentPackIds.has(r.id);
                      const total = typeof r.packs_count === "number" ? r.packs_count : 0;
                      const other = Math.max(0, total - (inThisPack ? 1 : 0));
                      if (inThisPack && other > 0) return ` · dans ce pack + ${other} autre(s)`;
                      if (inThisPack) return " · dans ce pack";
                      if (other > 0) return ` · dans ${other} pack(s)`;
                      return "";
                    })()}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void onAddOne(r.id)}
                  disabled={saving || inCurrentPackIds.has(r.id)}
                  variant={inCurrentPackIds.has(r.id) ? "outline" : "default"}
                >
                  {inCurrentPackIds.has(r.id) ? "Déjà dans le pack" : "Ajouter"}
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
          <Button type="button" onClick={() => void onSaveOrder()} disabled={saving || !orderedCards.length}>
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
