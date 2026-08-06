"use client";

import * as React from "react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAdminThumbOverrides,
  useCreateAdminThumbOverride,
  useDeleteAdminThumbOverride,
  usePatchAdminThumbOverride,
  useTaxonomyTree,
} from "@/lib/queries";
import { useStaffGuard } from "@/lib/staffGuard";
import type { TaxonomyNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PATTERN_OPTIONS, ThumbPatternOverlay, normalizePattern, type PatternName } from "@/components/thumbPatterns";

type AdminRow = {
  id: number;
  pathology_slug: string;
  bg: string;
  accent: string;
  pattern: PatternName;
  updated_at?: string;
};

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function parsePattern(value: string): PatternName {
  return normalizePattern(value) ?? "waves";
}

function normalizeHexForColorInput(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return "#000000";
}

function ThumbPreview({ bg, accent, pattern }: { bg: string; accent: string; pattern: PatternName }) {
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="64" height="64" fill={bg} />
        <ThumbPatternOverlay pattern={pattern} accent={accent} />
        <rect x="0" y="0" width="64" height="64" fill="#000" opacity="0.06" />
      </svg>
    </div>
  );
}

type MaladieChoice = {
  id: number;
  slug: string;
  name: string;
  path: string;
};

function flattenNodes(nodes: TaxonomyNode[], prefix: string[] = []): MaladieChoice[] {
  const out: MaladieChoice[] = [];
  for (const n of nodes) {
    const nextPrefix = [...prefix, n.name];
    out.push({ id: n.id, slug: n.slug, name: n.name, path: nextPrefix.join(" / ") });
    if (n.children?.length) out.push(...flattenNodes(n.children, nextPrefix));
  }
  return out;
}

export default function AdminVignettesPage() {
  const { checking, isStaff } = useStaffGuard();

  const {
    data: rows = [],
    isFetching: loading,
    error: rowsError,
    refetch,
  } = useAdminThumbOverrides(isStaff);

  const createMutation = useCreateAdminThumbOverride();
  const patchMutation = usePatchAdminThumbOverride();
  const deleteMutation = useDeleteAdminThumbOverride();

  const [actionError, setActionError] = React.useState<string | null>(null);
  const error = actionError ?? (rowsError ? toErrorMessage(rowsError) : null);

  const { data: maladiesTree, isPending: maladiesLoading } = useTaxonomyTree("maladies");
  const [maladieQuery, setMaladieQuery] = React.useState("");

  const [createSlug, setCreateSlug] = React.useState("");
  const [createBg, setCreateBg] = React.useState("#6D5BD0");
  const [createAccent, setCreateAccent] = React.useState("#D7D2FF");
  const [createPattern, setCreatePattern] = React.useState<PatternName>("waves");
  const creating = createMutation.isPending;

  const [editingSlug, setEditingSlug] = React.useState<string | null>(null);
  const [editSlug, setEditSlug] = React.useState("");
  const [editBg, setEditBg] = React.useState("");
  const [editAccent, setEditAccent] = React.useState("");
  const [editPattern, setEditPattern] = React.useState<PatternName>("waves");
  const saving = patchMutation.isPending;
  const deleting = deleteMutation.isPending ? deleteMutation.variables ?? null : null;

  const duplicateToCreate = (r: AdminRow) => {
    setCreateSlug(`${r.pathology_slug}-bis`);
    setCreateBg(r.bg);
    setCreateAccent(r.accent);
    setCreatePattern(r.pattern);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const maladieChoices = React.useMemo(() => {
    const tree = maladiesTree?.tree;
    if (!tree) return [] as MaladieChoice[];
    return flattenNodes(tree);
  }, [maladiesTree?.tree]);

  const maladieMatches = React.useMemo(() => {
    const q = maladieQuery.trim().toLowerCase();
    if (!q) return [] as MaladieChoice[];
    const res = maladieChoices.filter((c) => c.slug.toLowerCase().includes(q) || c.path.toLowerCase().includes(q));
    return res.slice(0, 30);
  }, [maladieChoices, maladieQuery]);

  const startEdit = (r: AdminRow) => {
    setEditingSlug(r.pathology_slug);
    setEditSlug(r.pathology_slug);
    setEditBg(r.bg);
    setEditAccent(r.accent);
    setEditPattern(r.pattern);
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setEditSlug("");
    setEditBg("");
    setEditAccent("");
    setEditPattern("waves");
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = createSlug.trim();
    if (!slug) return;

    setActionError(null);
    try {
      await createMutation.mutateAsync({
        pathology_slug: slug,
        bg: createBg.trim(),
        accent: createAccent.trim(),
        pattern: createPattern,
      });
      setCreateSlug("");
    } catch (err: unknown) {
      setActionError(toErrorMessage(err));
    }
  };

  const onSaveEdit = async () => {
    if (!editingSlug) return;
    setActionError(null);
    try {
      await patchMutation.mutateAsync({
        pathologySlug: editingSlug,
        input: {
          pathology_slug: editSlug.trim(),
          bg: editBg.trim(),
          accent: editAccent.trim(),
          pattern: editPattern,
        },
      });
      cancelEdit();
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const onDelete = async (slug: string) => {
    if (!slug) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(slug);
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  return (
    <MobileScaffold title="Admin — Vignettes" contentClassName="space-y-4">
      {checking ? <div className="text-sm text-muted-foreground">Vérification…</div> : null}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Créer un override</div>
        <form className="grid gap-2" onSubmit={onCreate}>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              placeholder="slug (ex: grippe)"
              disabled={creating}
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-10 shrink-0 rounded-md border bg-background"
                value={normalizeHexForColorInput(createBg)}
                onChange={(e) => setCreateBg(e.target.value)}
                disabled={creating}
                aria-label="Couleur de fond"
              />
              <Input value={createBg} onChange={(e) => setCreateBg(e.target.value)} disabled={creating} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-10 shrink-0 rounded-md border bg-background"
                value={normalizeHexForColorInput(createAccent)}
                onChange={(e) => setCreateAccent(e.target.value)}
                disabled={creating}
                aria-label="Couleur d'accent"
              />
              <Input value={createAccent} onChange={(e) => setCreateAccent(e.target.value)} disabled={creating} />
            </div>
            <select
              className={cn(
                "h-10 rounded-md border bg-background px-3 text-sm",
                creating ? "opacity-70" : ""
              )}
              value={createPattern}
              onChange={(e) => setCreatePattern(parsePattern(e.target.value))}
              disabled={creating}
            >
              {PATTERN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs font-semibold text-muted-foreground">Choisir une maladie existante</div>
            <div className="mt-2 grid gap-2">
              <Input
                value={maladieQuery}
                onChange={(e) => setMaladieQuery(e.target.value)}
                placeholder={maladiesLoading ? "Chargement…" : "Rechercher une maladie (nom ou slug)"}
                disabled={creating || maladiesLoading}
              />

              {maladieQuery.trim() && maladieMatches.length ? (
                <div className="max-h-56 overflow-auto rounded-md border">
                  {maladieMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setCreateSlug(c.slug);
                        setMaladieQuery("");
                      }}
                      disabled={creating}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.slug} · {c.path}</div>
                    </button>
                  ))}
                </div>
              ) : maladieQuery.trim() ? (
                <div className="text-xs text-muted-foreground">Aucun résultat.</div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <ThumbPreview bg={createBg.trim()} accent={createAccent.trim()} pattern={createPattern} />
              <div className="text-xs text-muted-foreground">Aperçu</div>
            </div>

            <Button type="submit" disabled={creating || !createSlug.trim()}>
              {creating ? "Création…" : "Créer"}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Overrides existants</div>
          <Button type="button" variant="outline" onClick={() => void refetch()} disabled={loading}>
            {loading ? "Actualisation…" : "Actualiser"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">{error}</div>
        ) : null}

        {!rows.length ? (
          <div className="text-sm text-muted-foreground">Aucun override.</div>
        ) : (
          <div className="grid gap-2">
            {rows.map((r) => {
              const isEditing = editingSlug === r.pathology_slug;
              return (
                <div key={r.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <ThumbPreview bg={r.bg} accent={r.accent} pattern={r.pattern} />
                      <div>
                        <div className="font-medium leading-snug">{r.pathology_slug}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.bg} · {r.accent} · {r.pattern}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => (isEditing ? cancelEdit() : startEdit(r))}
                        disabled={saving || deleting != null}
                      >
                        {isEditing ? "Annuler" : "Modifier"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateToCreate(r)}
                        disabled={saving || deleting != null}
                      >
                        Dupliquer
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void onDelete(r.pathology_slug)}
                        disabled={saving || deleting === r.pathology_slug}
                      >
                        {deleting === r.pathology_slug ? "Suppression…" : "Supprimer"}
                      </Button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 grid gap-2">
                      <div className="grid gap-2 sm:grid-cols-4">
                        <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} disabled={saving} />
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            className="h-10 w-10 shrink-0 rounded-md border bg-background"
                            value={normalizeHexForColorInput(editBg)}
                            onChange={(e) => setEditBg(e.target.value)}
                            disabled={saving}
                            aria-label="Couleur de fond"
                          />
                          <Input value={editBg} onChange={(e) => setEditBg(e.target.value)} disabled={saving} />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            className="h-10 w-10 shrink-0 rounded-md border bg-background"
                            value={normalizeHexForColorInput(editAccent)}
                            onChange={(e) => setEditAccent(e.target.value)}
                            disabled={saving}
                            aria-label="Couleur d'accent"
                          />
                          <Input value={editAccent} onChange={(e) => setEditAccent(e.target.value)} disabled={saving} />
                        </div>
                        <select
                          className={cn(
                            "h-10 rounded-md border bg-background px-3 text-sm",
                            saving ? "opacity-70" : ""
                          )}
                          value={editPattern}
                          onChange={(e) => setEditPattern(parsePattern(e.target.value))}
                          disabled={saving}
                        >
                          {PATTERN_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-lg border bg-background p-3">
                        <div className="text-xs font-semibold text-muted-foreground">Changer la maladie</div>
                        <div className="mt-2 grid gap-2">
                          <Input
                            value={maladieQuery}
                            onChange={(e) => setMaladieQuery(e.target.value)}
                            placeholder={maladiesLoading ? "Chargement…" : "Rechercher une maladie (nom ou slug)"}
                            disabled={saving || maladiesLoading}
                          />

                          {maladieQuery.trim() && maladieMatches.length ? (
                            <div className="max-h-56 overflow-auto rounded-md border">
                              {maladieMatches.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                                  onClick={() => {
                                    setEditSlug(c.slug);
                                    setMaladieQuery("");
                                  }}
                                  disabled={saving}
                                >
                                  <div className="font-medium">{c.name}</div>
                                  <div className="text-xs text-muted-foreground">{c.slug} · {c.path}</div>
                                </button>
                              ))}
                            </div>
                          ) : maladieQuery.trim() ? (
                            <div className="text-xs text-muted-foreground">Aucun résultat.</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <ThumbPreview bg={editBg.trim()} accent={editAccent.trim()} pattern={editPattern} />
                          <div className="text-xs text-muted-foreground">Aperçu</div>
                        </div>

                        <Button type="button" onClick={() => void onSaveEdit()} disabled={saving || !editSlug.trim()}>
                          {saving ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">Astuce : cette page est réservée aux comptes staff (`is_staff`).</div>
    </MobileScaffold>
  );
}
