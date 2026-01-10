"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check as CheckIcon,
  ChevronUp as ChevronUpIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Star as StarIcon,
  Text as TextIcon,
} from "lucide-react";

import { SeeMoreRenderer } from "@/components/SeeMoreRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MicroArticleDetail, StreamBlock } from "@/lib/types";

const DECK_STORAGE_KEY = "pharmapocket:lastDeck";

type DeckState = {
  slugs: string[];
  index: number;
  savedAt: number;
};

function readDeckFromSession(): DeckState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeckState>;
    if (!Array.isArray(parsed.slugs)) return null;
    const index = typeof parsed.index === "number" ? parsed.index : 0;
    return {
      slugs: parsed.slugs.filter((s) => typeof s === "string"),
      index,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeDeckToSession(next: DeckState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export default function ReaderClient({
  data,
}: {
  data: MicroArticleDetail;
}) {
  const router = useRouter();

  const [openDetails, setOpenDetails] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [largeText, setLargeText] = React.useState(false);

  const [deck, setDeck] = React.useState<DeckState | null>(null);

  React.useEffect(() => {
    const d = readDeckFromSession();
    if (!d) {
      setDeck(null);
      return;
    }

    const idx = d.slugs.indexOf(data.slug);
    if (idx >= 0 && idx !== d.index) {
      const next = { ...d, index: idx };
      setDeck(next);
      writeDeckToSession(next);
    } else {
      setDeck(d);
    }
  }, [data.slug]);

  const positionText = React.useMemo(() => {
    if (!deck?.slugs?.length) return null;
    const idx = deck.slugs.indexOf(data.slug);
    const current = idx >= 0 ? idx : deck.index;
    return `${current + 1}/${deck.slugs.length}`;
  }, [deck, data.slug]);

  const blocks = (data.see_more ?? []) as StreamBlock[];
  const detailBlocks = React.useMemo(() => blocks.filter((b) => b?.type === "detail"), [blocks]);
  const referenceBlocks = React.useMemo(
    () => blocks.filter((b) => b?.type === "references"),
    [blocks]
  );
  const extraBlocks = React.useMemo(
    () => blocks.filter((b) => b?.type !== "detail" && b?.type !== "references"),
    [blocks]
  );

  const hasLongContent = detailBlocks.length > 0;
  const hasSources = referenceBlocks.length > 0 || (data.links?.length ?? 0) > 0;
  const hasExtra = extraBlocks.length > 0;
  const hasDetails = hasLongContent || hasSources || hasExtra;

  const goRelative = (delta: number) => {
    if (!deck?.slugs?.length) return;
    const idx = deck.slugs.indexOf(data.slug);
    const current = idx >= 0 ? idx : deck.index;
    const nextIndex = current + delta;
    if (nextIndex < 0 || nextIndex >= deck.slugs.length) return;
    const nextSlug = deck.slugs[nextIndex];
    if (!nextSlug) return;

    const nextDeck = { ...deck, index: nextIndex };
    setDeck(nextDeck);
    writeDeckToSession(nextDeck);

    router.push(`/micro/${encodeURIComponent(nextSlug)}`);
  };

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (openDetails) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRelative(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRelative(+1);
      }
      if (e.key === "Escape") {
        setOpenDetails(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDetails, deck, data.slug]);

  const startRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (openDetails) return;
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (openDetails) return;
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < 60) return;
    if (adx < ady * 1.2) return;

    if (dx < 0) goRelative(+1);
    else goRelative(-1);
  };

  return (
    <div className="min-h-dvh bg-background" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-2">
          <Button asChild variant="ghost" size="icon" aria-label="Retour">
            <Link href="/discover">←</Link>
          </Button>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Taille du texte"
            onClick={() => setLargeText((v) => !v)}
          >
            <TextIcon className="size-5" />
          </Button>

          <Button
            variant={saved ? "secondary" : "ghost"}
            size="icon"
            aria-label="Sauvegarder"
            onClick={() => setSaved((v) => !v)}
          >
            <StarIcon className="size-5" fill={saved ? "currentColor" : "none"} />
          </Button>

          <Button
            variant={done ? "secondary" : "ghost"}
            size="icon"
            aria-label="Marquer comme fait"
            onClick={() => setDone((v) => !v)}
          >
            <CheckIcon className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Plus"
            onClick={() => setOpenDetails(true)}
            disabled={!hasDetails}
          >
            <MoreHorizontalIcon className="size-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className={largeText ? "space-y-3 text-[1.05rem]" : "space-y-3"}>
          <div className="text-2xl font-semibold leading-snug">{data.title_question}</div>

          <div className="relative">
            <div className="text-base text-muted-foreground line-clamp-4">
              {data.answer_express}
            </div>
          </div>

          {data.key_points?.length ? (
            <div className="flex flex-wrap gap-1">
              {data.key_points.slice(0, 3).map((p) => (
                <Badge key={p} variant="secondary" className="max-w-full truncate">
                  {p}
                </Badge>
              ))}
            </div>
          ) : null}

          {hasDetails ? (
            <button
              type="button"
              className="mx-auto flex items-center justify-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
              onClick={() => setOpenDetails(true)}
            >
              <span>Plus</span>
              <ChevronUpIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-6 text-xs text-muted-foreground">
        <div>{positionText ?? ""}</div>
        {deck?.slugs?.length ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Précédent"
              onClick={() => goRelative(-1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Suivant"
              onClick={() => goRelative(+1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        ) : (
          <div />
        )}
      </footer>

      <Sheet open={openDetails} onOpenChange={setOpenDetails}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Détails & sources</SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(85dvh-4.5rem)] px-4 pb-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold">{data.title_question}</div>
                <div className="text-sm text-muted-foreground">{data.takeaway}</div>
              </div>

              {hasLongContent ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Contenu long</div>
                    <SeeMoreRenderer seeMore={detailBlocks} />
                  </div>
                </>
              ) : null}

              {hasExtra ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Informations supplémentaires</div>
                    <SeeMoreRenderer seeMore={extraBlocks} />
                  </div>
                </>
              ) : null}

              {hasSources ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Sources</div>

                    <div className="rounded-xl border bg-card p-4">
                      <div className="text-sm font-semibold">Crédibilité</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {data.published_at ? (
                          <div>Publié le {new Date(data.published_at).toLocaleDateString()}</div>
                        ) : (
                          <div>Date de vérification à ajouter.</div>
                        )}
                      </div>
                    </div>

                    <SeeMoreRenderer seeMore={referenceBlocks} links={data.links} />
                  </div>
                </>
              ) : null}

              {data.questions?.length ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Questions</div>
                    <div className="space-y-3">
                      {data.questions.map((q) => (
                        <div key={q.id} className="rounded-xl border p-4">
                          <div className="text-sm font-semibold">{q.prompt}</div>
                          {q.explanation ? (
                            <div className="mt-2 text-sm text-muted-foreground">
                              {q.explanation}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
