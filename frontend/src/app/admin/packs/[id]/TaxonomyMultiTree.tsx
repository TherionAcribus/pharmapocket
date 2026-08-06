"use client";

import type { TaxonomyNode } from "@/lib/types";

type TaxonomyMultiTreeProps = {
  nodes: TaxonomyNode[];
  selected: number[];
  onToggle: (id: number) => void;
  depth?: number;
};

/** Arbre de taxonomie à sélection multiple, rendu récursivement. */
export function TaxonomyMultiTree({
  nodes,
  selected,
  onToggle,
  depth = 0,
}: TaxonomyMultiTreeProps) {
  return (
    <div className="space-y-1">
      {nodes.map((n) => (
        <div key={n.id} className="space-y-1">
          <label
            className="flex items-center gap-2 text-sm"
            style={{ paddingLeft: `${depth * 12}px` }}
          >
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
}
