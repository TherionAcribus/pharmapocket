import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { StreamBlock } from "@/lib/types";

function asArray<T>(value: unknown, guard?: (v: unknown) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  if (!guard) return value as T[];
  return value.filter(guard);
}

export function SeeMoreRenderer({
  seeMore,
  links,
}: {
  seeMore?: StreamBlock[];
  links?: StreamBlock[];
}) {
  return (
    <div className="space-y-6">
      {asArray<StreamBlock>(seeMore).map((b, idx) => {
        if (!b || typeof b !== "object") return null;

        if (b.type === "detail") {
          if (typeof b.value === "string") {
            return (
              <div
                key={idx}
                className="prose prose-zinc max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: b.value }}
              />
            );
          }
          return (
            <pre key={idx} className="rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(b.value, null, 2)}
            </pre>
          );
        }

        if (b.type === "mechanism_3_steps") {
          const v = (b.value as Record<string, unknown>) || {};
          return (
            <div key={idx} className="rounded-xl border p-4">
              <div className="text-sm font-semibold">Mécanisme (3 étapes)</div>
              <div className="mt-3 grid gap-2">
                <div>
                  <Badge variant="outline">Cible</Badge>
                  <div className="mt-1 text-sm">{String(v.target ?? "")}</div>
                </div>
                <div>
                  <Badge variant="outline">Action</Badge>
                  <div className="mt-1 text-sm">{String(v.action ?? "")}</div>
                </div>
                <div>
                  <Badge variant="outline">Conséquence</Badge>
                  <div className="mt-1 text-sm">{String(v.consequence ?? "")}</div>
                </div>
              </div>
            </div>
          );
        }

        if (
          [
            "indications",
            "adverse_effects",
            "warnings",
            "interactions",
            "references",
          ].includes(b.type)
        ) {
          const titleMap: Record<string, string> = {
            indications: "Indications",
            adverse_effects: "Effets indésirables",
            warnings: "Points de vigilance",
            interactions: "Interactions",
            references: "Références",
          };

          const rows = asArray<unknown>(b.value);
          return (
            <div key={idx} className="rounded-xl border p-4">
              <div className="text-sm font-semibold">{titleMap[b.type] ?? b.type}</div>
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm">
                {rows.map((r, i) => (
                  <li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
                ))}
              </ul>
            </div>
          );
        }

        if (b.type === "monitoring") {
          const v = (b.value as Record<string, unknown>) || {};
          return (
            <div key={idx} className="rounded-xl border p-4">
              <div className="text-sm font-semibold">Surveillance</div>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <Badge variant="outline">Quoi</Badge>
                  <div className="mt-1">{String(v.what ?? "")}</div>
                </div>
                <div>
                  <Badge variant="outline">Pourquoi</Badge>
                  <div className="mt-1">{String(v.why ?? "")}</div>
                </div>
              </div>
            </div>
          );
        }

        if (b.type === "image") {
          const v = (b.value as Record<string, unknown>) || {};
          return (
            <div key={idx} className="rounded-xl border p-4">
              <div className="text-sm font-semibold">Image</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Image id: {String(v.image ?? "—")}
              </div>
              {v.caption ? <div className="mt-2 text-sm">{String(v.caption)}</div> : null}
            </div>
          );
        }

        if (b.type === "final_summary") {
          return (
            <div key={idx} className="rounded-xl border p-4">
              <div className="text-sm font-semibold">Résumé</div>
              <div className="mt-2 text-sm">{String(b.value ?? "")}</div>
            </div>
          );
        }

        return (
          <pre key={idx} className="rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(b, null, 2)}
          </pre>
        );
      })}

      {asArray<StreamBlock>(links).length ? (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="text-sm font-semibold">Liens</div>
            <div className="space-y-2">
              {asArray<StreamBlock>(links).map((l, idx) => {
                if (l?.type !== "link") return null;
                const v = (l.value as Record<string, unknown>) || {};
                const url = typeof v.url === "string" ? v.url : undefined;
                return (
                  <div key={idx} className="text-sm">
                    {url ? (
                      <Link href={url} target="_blank" className="underline">
                        {typeof v.title === "string" ? v.title : url}
                      </Link>
                    ) : (
                      <span>{typeof v.title === "string" ? v.title : "Lien"}</span>
                    )}
                    {typeof v.source === "string" ? (
                      <span className="text-muted-foreground"> · {v.source}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
