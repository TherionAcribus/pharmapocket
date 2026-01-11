"use client";

import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { MicroArticleListItem } from "@/lib/types";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";

export function MicroCard({
  item,
  deckSlugs,
  deckIndex,
  isRead,
}: {
  item: MicroArticleListItem;
  deckSlugs?: string[];
  deckIndex?: number;
  isRead?: boolean;
}) {
  const onOpen = () => {
    if (typeof window === "undefined") return;
    if (!deckSlugs?.length) return;
    const index = typeof deckIndex === "number" ? deckIndex : deckSlugs.indexOf(item.slug);
    try {
      window.sessionStorage.setItem(
        DECK_STORAGE_KEY,
        JSON.stringify({ slugs: deckSlugs, index, savedAt: Date.now() })
      );
    } catch {
      // ignore
    }
  };

  return (
    <Link
      href={`/micro/${item.slug}`}
      className={
        isRead
          ? "block rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent opacity-70"
          : "block rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent"
      }
      onClick={onOpen}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-base font-semibold leading-snug">
            {item.title}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            <div
              className="prose prose-zinc max-w-none line-clamp-2 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: item.answer_express }}
            />
          </div>

          {item.key_points?.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {item.key_points.slice(0, 3).map((p) => (
                <Badge key={p} variant="secondary" className="max-w-full truncate">
                  {p}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative mt-0.5 h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {item.cover_image_url ? (
            <Image
              src={item.cover_image_url}
              alt={item.title}
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : null}
        </div>
      </div>
    </Link>
  );
}
