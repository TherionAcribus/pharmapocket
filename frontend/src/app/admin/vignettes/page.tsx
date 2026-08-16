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

/** Approximation du `slugify` de Django, pour comparer une saisie libre aux slugs de la taxonomie. */
function slugifyLoose(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const [createMaladieQuery, setCreateMaladieQuery] = React.useState("");

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
  const [editMaladieQuery, setEditMaladieQuery] = React.useState("");
  const saving = patchMutation.isPending;
  const deleting = deleteMutation.isPending ? deleteMutation.variables ?? null : null;

  const maladieSearchRef = React.useRef<HTMLInputElement | null>(null);

  const duplicateToCreate = (r: AdminRow) => {
    // On ne recopie que l'apparence. Un slug dérivé (`<slug>-bis`) ne
    // correspondrait à aucune pathologie : l'override serait bien créé mais
    // ne s'appliquerait à aucune vignette. Le slug doit donc être choisi
    // dans la taxonomie, d'où le champ vidé et le focus sur la recherche.
    setCreateSlug("");
    setCreateBg(r.bg);
    setCreateAccent(r.accent);
    setCreatePattern(r.pattern);
    setCreateMaladieQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    maladieSearchRef.current?.focus();
  };

  const maladieChoices = React.useMemo(() => {
    const tree = maladiesTree?.tree;
    if (!tree) return [] as MaladieChoice[];
    return flattenNodes(tree);
  }, [maladiesTree?.tree]);

  const knownSlugs = React.useMemo(
    () => new Set(maladieChoices.map((c) => c.slug.toLowerCase())),
    [maladieChoices]
  );

  // Simple avertissement, pas un blocage : l'arbre peut ne pas être chargé et
  // c'est le serveur qui refuse pour de bon un slug hors taxonomie.
  const isUnknownSlug = (slug: string) => {
    const s = slugifyLoose(slug);
    return Boolean(s) && knownSlugs.size > 0 && !knownSlugs.has(s);
  };

  const createSlugUnknown = isUnknownSlug(createSlug);

  const createMaladieMatches = React.useMemo(() => {
    const q = createMaladieQuery.trim().toLowerCase();
    if (!q) return [] as MaladieChoice[];
    const res = maladieChoices.filter((c) => c.slug.toLowerCase().includes(q) || c.path.toLowerCase().includes(q));
    return res.slice(0, 30);
  }, [createMaladieQuery, maladieChoices]);

  const editMaladieMatches = React.useMemo(() => {
    const q = editMaladieQuery.trim().toLowerCase();
    if (!q) return [] as MaladieChoice[];
    const res = maladieChoices.filter((c) => c.slug.toLowerCase().includes(q) || c.path.toLowerCase().includes(q));
    return res.slice(0, 30);
  }, [editMaladieQuery, maladieChoices]);

  const startEdit = (r: AdminRow) => {
    setEditingSlug(r.pathology_slug);
    setEditSlug(r.pathology_slug);
    setEditBg(r.bg);
    setEditAccent(r.accent);
    setEditPattern(r.pattern);
    setEditMaladieQuery("");
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setEditSlug("");
    setEditBg("");
    setEditAccent("");
    setEditPattern("waves");
    setEditMaladieQuery("");
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

    // La suppression n'est pas annulable et la ligne ne porte aucun état à
    // restaurer : il faut la recréer à la main (couleurs + motif). D'où la
    // confirmation, avec le slug rappelé — les boutons d'une ligne à l'autre
    // sont identiques et rien ne distingue visuellement la ligne visée.
    const ok = window.confirm(
      `Supprimer l'override de « ${slug} » ? Cette action est irréversible : la vignette repassera aux couleurs générées par défaut.`
    );
    if (!ok) return;

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
                ref={maladieSearchRef}
                value={createMaladieQuery}
                onChange={(e) => setCreateMaladieQuery(e.target.value)}
                placeholder={maladiesLoading ? "Chargement…" : "Rechercher une maladie (nom ou slug)"}
                disabled={creating || maladiesLoading}
              />

              {createMaladieQuery.trim() && createMaladieMatches.length ? (
                <div className="max-h-56 overflow-auto rounded-md border">
                  {createMaladieMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setCreateSlug(c.slug);
                        setCreateMaladieQuery("");
                      }}
                      disabled={creating}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.slug} · {c.path}</div>
                    </button>
                  ))}
                </div>
              ) : createMaladieQuery.trim() ? (
                <div className="text-xs text-muted-foreground">Aucun résultat.</div>
              ) : null}
            </div>
          </div>

          {createSlugUnknown ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              Aucune maladie ne porte ce slug : l&apos;override ne s&apos;appliquerait à aucune fiche.
              Choisissez une maladie dans la liste ci-dessus.
            </div>
          ) : null}

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
                        <div className="flex items-center gap-2">
                          <span className="font-medium leading-snug">{r.pathology_slug}</span>
                          {/* Lignes héritées d'avant la validation serveur : elles ne
                              s'appliquent à rien tant que le slug reste inconnu. */}
                          {isUnknownSlug(r.pathology_slug) ? (
                            <span className="rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                              slug inconnu
                            </span>
                          ) : null}
                        </div>
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
                            value={editMaladieQuery}
                            onChange={(e) => setEditMaladieQuery(e.target.value)}
                            placeholder={maladiesLoading ? "Chargement…" : "Rechercher une maladie (nom ou slug)"}
                            disabled={saving || maladiesLoading}
                          />

                          {editMaladieQuery.trim() && editMaladieMatches.length ? (
                            <div className="max-h-56 overflow-auto rounded-md border">
                              {editMaladieMatches.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                                  onClick={() => {
                                    setEditSlug(c.slug);
                                    setEditMaladieQuery("");
                                  }}
                                  disabled={saving}
                                >
                                  <div className="font-medium">{c.name}</div>
                                  <div className="text-xs text-muted-foreground">{c.slug} · {c.path}</div>
                                </button>
                              ))}
                            </div>
                          ) : editMaladieQuery.trim() ? (
                            <div className="text-xs text-muted-foreground">Aucun résultat.</div>
                          ) : null}
                        </div>
                      </div>

                      {isUnknownSlug(editSlug) ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                          Aucune maladie ne porte ce slug : l&apos;override ne s&apos;appliquerait à aucune fiche.
                        </div>
                      ) : null}

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
