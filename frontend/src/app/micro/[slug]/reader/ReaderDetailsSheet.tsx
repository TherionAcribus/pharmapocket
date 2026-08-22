"use client";

import * as React from "react";

import { SeeMoreRenderer } from "@/components/SeeMoreRenderer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MicroArticleDetail } from "@/lib/types";

import { RichText } from "@/components/RichText";
import type { SeeMoreSections } from "./seeMoreSections";

type ReaderDetailsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MicroArticleDetail;
  sections: SeeMoreSections;
};

/** Panneau « Détails & sources », ouvert au swipe vers le haut ou au bouton. */
export function ReaderDetailsSheet({
  open,
  onOpenChange,
  data,
  sections,
}: ReaderDetailsSheetProps) {
  const { detailBlocks, extraBlocks, referenceBlocks, hasLongContent, hasExtra, hasSources } =
    sections;

  // Le swipe vers le bas sur la poignée referme le panneau.
  const startRef = React.useRef<{ x: number; y: number } | null>(null);

  const onHandleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY };
  };

  const onHandleTouchEnd = (e: React.TouchEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const adx = Math.abs(t.clientX - start.x);
    const dy = t.clientY - start.y;
    const ady = Math.abs(dy);

    if (ady > 60 && ady > adx * 1.2 && dy > 0) {
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <button
          type="button"
          className="px-4 pt-3"
          aria-label="Glisser vers le bas pour fermer"
          onTouchStart={onHandleTouchStart}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-muted" />
        </button>

        <SheetHeader>
          <SheetTitle>Détails & sources</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-sm font-semibold">{data.title}</div>
              <RichText
                html={data.takeaway}
                className="prose prose-zinc max-w-none text-sm text-muted-foreground dark:prose-invert"
              />
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
                          <div className="mt-2 text-sm text-muted-foreground">{q.explanation}</div>
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
  );
}
