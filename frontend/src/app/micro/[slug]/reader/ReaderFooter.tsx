"use client";

import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ReaderFooterProps = {
  positionText: string | null;
  hasDeck: boolean;
  onPrev: () => void;
  onNext: () => void;
};

/** Position dans le deck et flèches de navigation (absentes hors parcours). */
export function ReaderFooter({ positionText, hasDeck, onPrev, onNext }: ReaderFooterProps) {
  return (
    <footer className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-6 text-xs text-muted-foreground">
      <div>{positionText ?? ""}</div>
      {hasDeck ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Précédent"
            onClick={onPrev}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Suivant"
            onClick={onNext}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      ) : (
        <div />
      )}
    </footer>
  );
}
