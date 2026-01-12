"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy as CopyIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StreamBlock } from "@/lib/types";

function asArray<T>(value: unknown, guard?: (v: unknown) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  if (!guard) return value as T[];
  return value.filter(guard);
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") return;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export function SeeMoreRenderer({
  seeMore,
  links,
}: {
  seeMore?: StreamBlock[];
  links?: StreamBlock[];
}) {
  const [copied, setCopied] = React.useState<string | null>(null);

  const onCopy = async (value: string) => {
    try {
      await copyText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((v) => (v === value ? null : v)), 1200);
    } catch {
      // ignore
    }
  };

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

          if (b.type === "references") {
            return (
              <div key={idx} className="rounded-xl border p-4">
                <div className="text-sm font-semibold">{titleMap[b.type] ?? b.type}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {rows.map((r, i) => {
                    const refObj = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
                    const source = refObj && typeof refObj.source === "object" ? (refObj.source as Record<string, unknown>) : null;
                    const document =
                      refObj && typeof refObj.document === "object" ? (refObj.document as Record<string, unknown>) : null;

                    const sourceName = typeof source?.name === "string" ? source.name : undefined;
                    const sourceTitle = typeof source?.title === "string" ? source.title : undefined;
                    const url = typeof source?.url === "string" ? source.url : undefined;
                    const publisher = typeof source?.publisher === "string" ? source.publisher : undefined;
                    const author = typeof source?.author === "string" ? source.author : undefined;
                    const pubDate = typeof source?.publication_date === "string" ? source.publication_date : undefined;
                    const note = typeof refObj?.note === "string" ? refObj.note : undefined;
                    const page = typeof refObj?.page === "string" ? refObj.page : undefined;
                    const documentTitle = typeof document?.title === "string" ? document.title : undefined;
                    const documentUrl = typeof document?.url === "string" ? document.url : undefined;

                    const primaryLabel = [publisher, author].filter(Boolean).join(" · ");
                    const baseTitle = sourceName || sourceTitle;
                    const fallbackTitle = (typeof r === "string" ? r : null) || "Source";
                    const title = primaryLabel
                      ? [primaryLabel, baseTitle].filter(Boolean).join(" — ")
                      : baseTitle || publisher || author || fallbackTitle;
                    const metaParts = [publisher, author, pubDate].filter(Boolean).join(" · ");
                    const copyTextValue =
                      [
                        title,
                        url ? `URL: ${url}` : null,
                        publisher ? `Éditeur: ${publisher}` : null,
                        author ? `Auteur: ${author}` : null,
                        pubDate ? `Date: ${pubDate}` : null,
                        page ? `Page: ${page}` : null,
                        note ? `Note: ${note}` : null,
                        documentTitle ? `Document: ${documentTitle}` : null,
                        documentUrl ? `Document URL: ${documentUrl}` : null,
                      ]
                        .filter(Boolean)
                        .join(" | ") || (typeof r === "string" ? r : JSON.stringify(r));

                    return (
                      <li key={i} className="rounded-lg border p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-sm font-semibold leading-tight">
                              {url ? (
                                <Link href={url} target="_blank" className="underline">
                                  {title}
                                </Link>
                              ) : (
                                title
                              )}
                            </div>
                            {metaParts ? <div className="text-xs text-muted-foreground">{metaParts}</div> : null}
                            {note ? <div className="text-xs text-muted-foreground">Note : {note}</div> : null}
                            {page ? <div className="text-xs text-muted-foreground">Page : {page}</div> : null}
                            {documentTitle || documentUrl ? (
                              <div className="text-xs">
                                {documentUrl ? (
                                  <Link href={documentUrl} target="_blank" className="underline">
                                    {documentTitle || documentUrl}
                                  </Link>
                                ) : (
                                  documentTitle
                                )}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Copier la référence"
                              onClick={() => onCopy(copyTextValue)}
                            >
                              <CopyIcon className="size-4" />
                            </Button>
                            {copied === copyTextValue ? (
                              <span className="text-[11px] text-muted-foreground">Copié</span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }

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
          const image = v.image && typeof v.image === "object" ? (v.image as Record<string, unknown>) : null;
          const url = image && typeof image.url === "string" ? image.url : null;
          const title = image && typeof image.title === "string" ? image.title : null;
          const creditText = image && typeof image.credit_text === "string" ? image.credit_text : null;
          const creditSourceUrl = image && typeof image.credit_source_url === "string" ? image.credit_source_url : null;
          const license = image && typeof image.credit_license === "string" ? image.credit_license : null;
          const licenseUrl = image && typeof image.credit_license_url === "string" ? image.credit_license_url : null;
          const caption = typeof v.caption === "string" ? v.caption : null;
          return (
            <div key={idx} className="rounded-xl border p-4">
              <div className="text-sm font-semibold">Image</div>
              {url ? (
                <div className="relative mt-3 aspect-video overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={url}
                    alt={caption || title || "Illustration"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 768px"
                  />
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">Image id: {String(v.image ?? "—")}</div>
              )}
              {caption ? <div className="mt-2 text-sm">{caption}</div> : null}
              {creditText ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {creditSourceUrl ? (
                    <Link href={creditSourceUrl} target="_blank" className="underline">
                      {creditText}
                    </Link>
                  ) : (
                    creditText
                  )}
                  {license ? (
                    <>
                      {" "}
                      {licenseUrl ? (
                        <Link href={licenseUrl} target="_blank" className="underline">
                          ({license})
                        </Link>
                      ) : (
                        <>({license})</>
                      )}
                    </>
                  ) : null}
                </div>
              ) : null}
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
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
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

                    {url ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Copier l'URL"
                        onClick={() => onCopy(url)}
                      >
                        <CopyIcon className="size-4" />
                      </Button>
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
