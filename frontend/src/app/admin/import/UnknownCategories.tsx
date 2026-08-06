"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaxonomyName } from "@/lib/api/taxonomies";
import { useCreateTaxonomyNode, useTaxonomyTree } from "@/lib/queries";
import type { TaxonomyNode, UnknownCategory } from "@/lib/types";

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Aplatit l'arbre pour le sélecteur de parent, en marquant la profondeur. */
function flatten(nodes: TaxonomyNode[], depth = 0): { id: number; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

function CategoryRow({
  item,
  onCreated,
}: {
  item: UnknownCategory;
  onCreated: () => void;
}) {
  const taxonomy = item.taxonomy as TaxonomyName;
  const { data: tree } = useTaxonomyTree(taxonomy);
  const createMutation = useCreateTaxonomyNode();

  const [name, setName] = React.useState(item.suggested_name);
  const [slug, setSlug] = React.useState(item.suggested_slug);
  const [parentId, setParentId] = React.useState<string>("");
  const [created, setCreated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const options = React.useMemo(() => flatten(tree?.tree ?? []), [tree]);

  const onCreate = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({
        taxonomy,
        name: name.trim(),
        slug: slug.trim() || undefined,
        parent_id: parentId ? Number(parentId) : null,
      });
      setCreated(true);
      onCreated();
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  };

  if (created) {
    return (
      <div className="rounded-lg border bg-background p-3 text-sm">
        <span className="font-medium">{name}</span> créée dans{" "}
        <span className="text-muted-foreground">{item.field}</span>.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <div className="text-sm">
        <span className="font-medium">{item.value}</span>
        <span className="text-muted-foreground"> — proposée pour {item.field}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom"
          aria-label="Nom de la catégorie"
        />
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          aria-label="Slug de la catégorie"
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Catégorie parente"
        >
          <option value="">— racine —</option>
          {options.map((option) => (
            <option key={option.id} value={String(option.id)}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void onCreate()}
          disabled={createMutation.isPending || !name.trim()}
        >
          {createMutation.isPending ? "Création…" : "Créer"}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}

/**
 * Catégories citées par le JSON et absentes de l'arbre. Le LLM est invité à en
 * proposer : la réponse n'est donc pas « erreur » mais « à valider », d'où
 * l'édition du nom, du slug et du parent avant création.
 */
export function UnknownCategories({
  items,
  onCreated,
}: {
  items: UnknownCategory[];
  onCreated: () => void;
}) {
  if (!items.length) return null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">Catégories à créer</div>
      <p className="text-xs text-muted-foreground">
        Ces catégories n&apos;existent pas encore. Vérifie le nom et place-les dans
        l&apos;arbre, ou corrige le JSON si le modèle a simplement mal recopié un slug.
        Relance ensuite l&apos;import.
      </p>

      <div className="grid gap-2">
        {items.map((item) => (
          <CategoryRow
            key={`${item.taxonomy}:${item.suggested_slug}`}
            item={item}
            onCreated={onCreated}
          />
        ))}
      </div>
    </div>
  );
}
