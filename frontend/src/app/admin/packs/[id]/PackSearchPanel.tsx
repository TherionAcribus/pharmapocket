"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTags, useTaxonomyTree } from "@/lib/queries";
import type { AdminMicroArticleSearchQuery } from "@/lib/api/admin";
import type { AdminMicroArticleSearchResult, TaxonomyNode } from "@/lib/types";

import { TaxonomyMultiTree } from "./TaxonomyMultiTree";

type Scope = "exact" | "subtree";

function toggleInList<T>(prev: T[], value: T): T[] {
  const set = new Set(prev);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set);
}

function TaxonomyFilter({
  title,
  tree,
  selected,
  onToggle,
  scope,
  onScopeChange,
}: {
  title: string;
  tree: TaxonomyNode[] | undefined;
  selected: number[];
  onToggle: (id: number) => void;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as Scope)}
        >
          <option value="subtree">subtree</option>
          <option value="exact">exact</option>
        </select>
      </div>
      <div className="max-h-56 overflow-auto rounded border p-2">
        {tree?.length ? (
          <TaxonomyMultiTree nodes={tree} selected={selected} onToggle={onToggle} />
        ) : (
          <div className="text-xs text-muted-foreground">Aucun arbre.</div>
        )}
      </div>
    </div>
  );
}

type PackSearchPanelProps = {
  saving: boolean;
  searchLoading: boolean;
  searchResults: AdminMicroArticleSearchResult[] | undefined;
  inCurrentPackIds: Set<number>;
  onSearch: (criteria: AdminMicroArticleSearchQuery) => void;
  onAddOne: (microarticleId: number) => Promise<void>;
};

/** Recherche de micro-articles (texte, tags, taxonomies) et ajout au pack. */
export function PackSearchPanel({
  saving,
  searchLoading,
  searchResults,
  inCurrentPackIds,
  onSearch,
  onAddOne,
}: PackSearchPanelProps) {
  const [searchQ, setSearchQ] = React.useState("");
  const [searchRecent, setSearchRecent] = React.useState(false);

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

  const [themeScope, setThemeScope] = React.useState<Scope>("subtree");
  const [medicamentScope, setMedicamentScope] = React.useState<Scope>("subtree");
  const [maladiesScope, setMaladiesScope] = React.useState<Scope>("subtree");
  const [pharmacologieScope, setPharmacologieScope] = React.useState<Scope>("subtree");

  const results = searchResults ?? [];

  const submit = () => {
    onSearch({
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

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">Recherche + ajout</div>

      <div className="grid gap-2">
        <div className="flex gap-2">
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Texte (optionnel)…"
          />
          <label className="flex items-center gap-2 rounded-md border bg-background px-3 text-sm">
            <input
              type="checkbox"
              checked={searchRecent}
              onChange={(e) => setSearchRecent(e.target.checked)}
            />
            <span>Dernières</span>
          </label>
          <Button type="button" variant="outline" onClick={submit} disabled={searchLoading}>
            {searchLoading ? "…" : "Rechercher"}
          </Button>
        </div>

        <div className="rounded-md border bg-background p-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">
            Filtres (AND entre blocs)
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Tags</div>
            <Input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Filtrer tags…"
            />
            {tagsLoading ? <div className="text-xs text-muted-foreground">Chargement…</div> : null}
            <div className="max-h-40 overflow-auto rounded border p-2 space-y-1">
              {tags.slice(0, 80).map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(t.slug)}
                    onChange={() => setSelectedTags((prev) => toggleInList(prev, t.slug))}
                  />
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{t.slug}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <TaxonomyFilter
              title="Thème"
              tree={themeTree?.tree}
              selected={themeNodes}
              onToggle={(id) => setThemeNodes((prev) => toggleInList(prev, id))}
              scope={themeScope}
              onScopeChange={setThemeScope}
            />
            <TaxonomyFilter
              title="Maladies"
              tree={maladiesTree?.tree}
              selected={maladiesNodes}
              onToggle={(id) => setMaladiesNodes((prev) => toggleInList(prev, id))}
              scope={maladiesScope}
              onScopeChange={setMaladiesScope}
            />
            <TaxonomyFilter
              title="Médicament"
              tree={medicamentTree?.tree}
              selected={medicamentNodes}
              onToggle={(id) => setMedicamentNodes((prev) => toggleInList(prev, id))}
              scope={medicamentScope}
              onScopeChange={setMedicamentScope}
            />
            <TaxonomyFilter
              title="Pharmacologie"
              tree={pharmacologieTree?.tree}
              selected={pharmacologieNodes}
              onToggle={(id) => setPharmacologieNodes((prev) => toggleInList(prev, id))}
              scope={pharmacologieScope}
              onScopeChange={setPharmacologieScope}
            />
          </div>
        </div>
      </div>

      {results.length ? (
        <div className="grid gap-2">
          {results.map((r) => {
            const inThisPack = inCurrentPackIds.has(r.id);
            const total = typeof r.packs_count === "number" ? r.packs_count : 0;
            const other = Math.max(0, total - (inThisPack ? 1 : 0));

            let membershipLabel = "";
            if (inThisPack && other > 0) membershipLabel = ` · dans ce pack + ${other} autre(s)`;
            else if (inThisPack) membershipLabel = " · dans ce pack";
            else if (other > 0) membershipLabel = ` · dans ${other} pack(s)`;

            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.slug} · #{r.id}
                    {membershipLabel}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void onAddOne(r.id)}
                  disabled={saving || inThisPack}
                  variant={inThisPack ? "outline" : "default"}
                >
                  {inThisPack ? "Déjà dans le pack" : "Ajouter"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Aucun résultat.</div>
      )}
    </div>
  );
}
