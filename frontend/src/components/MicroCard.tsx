"use client";

import Link from "next/link";

import { GeneratedThumb } from "@/components/GeneratedThumb";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MicroArticleListItem } from "@/lib/types";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";
const RETURN_TO_STORAGE_KEY = "pp_reader:returnTo";

export function MicroCard({
  item,
  deckSlugs,
  deckIndex,
  isRead,
  selectMode,
  selected,
  onSelectedChange,
}: {
  item: MicroArticleListItem;
  deckSlugs?: string[];
  deckIndex?: number;
  isRead?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;
}) {
  const sharedDecksCount = typeof item.decks_count === "number" ? item.decks_count : null;

  const onOpen = () => {
    if (typeof window === "undefined") return;
    if (!deckSlugs?.length) return;
    const index = typeof deckIndex === "number" ? deckIndex : deckSlugs.indexOf(item.slug);
    try {
      window.sessionStorage.setItem(
        RETURN_TO_STORAGE_KEY,
        `${window.location.pathname}${window.location.search || ""}`
      );
      window.sessionStorage.setItem(
        DECK_STORAGE_KEY,
        JSON.stringify({ slugs: deckSlugs, index, savedAt: Date.now() })
      );
    } catch {
      // ignore
    }
  };

  const className =
    isRead
      ? "block rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent opacity-70"
      : "block rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent";

  const content = (
    <div className="flex items-start gap-3 p-4">
      {selectMode ? (
        <div className="pt-0.5">
          <Checkbox
            checked={Boolean(selected)}
            onCheckedChange={(v) => onSelectedChange?.(Boolean(v))}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-base font-semibold leading-snug">{item.title}</div>

        {sharedDecksCount && sharedDecksCount > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary">Dans {sharedDecksCount} decks</Badge>
          </div>
        ) : null}

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
        <GeneratedThumb item={item} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );

  if (selectMode) {
    return (
      <div className={className} onClick={() => onSelectedChange?.(!Boolean(selected))}>
        {content}
      </div>
    );
  }

  return (
    <Link href={`/micro/${item.slug}`} className={className} onClick={onOpen}>
      {content}
    </Link>
  );
}
