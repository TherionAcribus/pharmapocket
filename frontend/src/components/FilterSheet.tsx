"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { fetchTags, fetchTaxonomyTree } from "@/lib/api";
import { TagPayload, TaxonomyNode, TaxonomyTreeResponse } from "@/lib/types";

type Taxonomy = "pharmacologie" | "maladies" | "classes" | "theme" | "medicament";
type Scope = "exact" | "subtree";

function parseTags(sp: URLSearchParams): string[] {
  const raw = sp.get("tags");
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseTaxonomy(sp: URLSearchParams): Taxonomy | null {
  const t = sp.get("taxonomy");
  if (t === "pharmacologie" || t === "maladies" || t === "classes" || t === "theme" || t === "medicament") return t;
  return null;
}

function parseScope(sp: URLSearchParams): Scope | null {
  const s = sp.get("scope");
  if (s === "exact" || s === "subtree") return s;
  return null;
}

function parseNode(sp: URLSearchParams): number | null {
  const raw = sp.get("node") ?? sp.get("category");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildUrl(
  basePath: string,
  searchParams: URLSearchParams,
  updates: Record<string, string | null>
): string {
  const next = new URLSearchParams(searchParams.toString());
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") next.delete(k);
    else next.set(k, v);
  }
  next.delete("cursor");
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function TaxonomyTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: TaxonomyNode[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="space-y-1">
      {nodes.map((n) => (
        <div key={n.id} className="space-y-1">
          <button
            type="button"
            className={`w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent ${
              selectedId === n.id ? "bg-accent" : ""
            }`}
            onClick={() => onSelect(n.id)}
          >
            {n.name}
          </button>
          {n.children?.length ? (
            <div className="ml-4 border-l pl-2">
              <TaxonomyTree nodes={n.children} selectedId={selectedId} onSelect={onSelect} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function FilterSheet({ basePath = "/discover" }: { basePath?: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  const currentTags = useMemo(() => parseTags(sp), [sp]);
  const currentTaxonomy = useMemo(() => parseTaxonomy(sp), [sp]);
  const currentScope = useMemo(() => parseScope(sp) ?? "subtree", [sp]);
  const currentNode = useMemo(() => parseNode(sp), [sp]);
  const currentQ = sp.get("q") ?? "";

  const [tagQuery, setTagQuery] = useState("");
  const [tags, setTags] = useState<TagPayload[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  const [taxonomy, setTaxonomy] = useState<Taxonomy>(currentTaxonomy ?? "pharmacologie");
  const [tree, setTree] = useState<TaxonomyTreeResponse | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingTags(true);
    fetchTags(tagQuery, 200)
      .then((rows) => {
        if (cancelled) return;
        setTags(rows);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingTags(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tagQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTree(true);
    fetchTaxonomyTree(taxonomy)
      .then((t) => {
        if (cancelled) return;
        setTree(t);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingTree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taxonomy]);

  const toggleTag = (slug: string) => {
    const set = new Set(currentTags);
    if (set.has(slug)) set.delete(slug);
    else set.add(slug);
    router.push(buildUrl(basePath, sp, { tags: Array.from(set).join(",") || null }));
  };

  const setScope = (scope: Scope) => {
    router.push(buildUrl(basePath, sp, { scope }));
  };

  const setNode = (id: number) => {
    router.push(buildUrl(basePath, sp, { taxonomy, node: String(id), scope: currentScope }));
  };

  const clearAll = () => {
    router.push(basePath);
  };

  const selectedTagBadges = currentTags.map((t) => (
    <Badge key={t} variant="secondary" className="truncate">
      {t}
    </Badge>
  ));

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Filtres</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:w-[420px]">
        <SheetHeader>
          <SheetTitle>Filtres</SheetTitle>
          <SheetDescription>
            Ajuste les tags et catégories. L’état est synchronisé dans l’URL.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground truncate">q={currentQ || "—"}</div>
          <Button variant="outline" size="sm" onClick={clearAll}>
            Reset
          </Button>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <div className="text-sm font-semibold">Tags</div>
          <Input
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="Rechercher un tag…"
          />
          {currentTags.length ? (
            <div className="flex flex-wrap gap-1">{selectedTagBadges}</div>
          ) : null}

          <ScrollArea className="h-56 rounded-lg border p-2">
            <div className="space-y-2">
              {loadingTags ? (
                <div className="text-sm text-muted-foreground">Chargement…</div>
              ) : null}
              {!loadingTags && !tags.length ? (
                <div className="text-sm text-muted-foreground">Aucun tag.</div>
              ) : null}
              {tags.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={currentTags.includes(t.slug)}
                    onCheckedChange={() => toggleTag(t.slug)}
                  />
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{t.slug}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <div className="text-sm font-semibold">Taxonomy</div>

          <div className="flex flex-wrap gap-2">
            {(["theme", "medicament", "pharmacologie", "maladies", "classes"] as Taxonomy[]).map((t) => (
              <Button
                key={t}
                variant={taxonomy === t ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTaxonomy(t);
                  router.push(buildUrl(basePath, sp, { taxonomy: t }));
                }}
              >
                {t}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant={currentScope === "subtree" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("subtree")}
            >
              Subtree
            </Button>
            <Button
              variant={currentScope === "exact" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("exact")}
            >
              Exact
            </Button>
          </div>

          <ScrollArea className="h-64 rounded-lg border p-2">
            {loadingTree ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : null}
            {!loadingTree && tree?.tree?.length ? (
              <TaxonomyTree
                nodes={tree.tree}
                selectedId={currentNode}
                onSelect={setNode}
              />
            ) : null}
            {!loadingTree && !tree?.tree?.length ? (
              <div className="text-sm text-muted-foreground">Aucune donnée.</div>
            ) : null}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
