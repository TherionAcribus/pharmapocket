"use client";

import Link from "next/link";
import { ChevronRight, FileText, ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ParentRecapCard, RecapPoint } from "@/lib/types";

type RecapPointsListProps = {
  points: RecapPoint[];
  title?: string;
  className?: string;
};

export function RecapPointsList({ points, title, className }: RecapPointsListProps) {
  if (!points.length) return null;

  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      {title ? (
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ListChecks className="size-4 text-primary" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
      ) : null}
      <ul className="divide-y">
        {points.map((point, idx) => {
          const hasLink = point.detail_card !== null;
          const content = (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm">{point.text}</span>
              {hasLink ? (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              ) : null}
            </>
          );

          if (hasLink && point.detail_card) {
            return (
              <li key={point.id}>
                <Link
                  href={`/micro/${point.detail_card.slug}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  {content}
                </Link>
              </li>
            );
          }

          return (
            <li key={point.id} className="flex items-center gap-3 px-4 py-3">
              {content}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ParentRecapLinksProps = {
  recapCards: ParentRecapCard[];
  className?: string;
};

export function ParentRecapLinks({ recapCards, className }: ParentRecapLinksProps) {
  if (!recapCards.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {recapCards.map((card) => (
        <Link
          key={card.id}
          href={`/micro/${card.slug}`}
          className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <FileText className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">Voir la fiche récap</div>
            <div className="truncate text-sm font-medium">{card.title}</div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

type CardTypeBadgeProps = {
  cardType?: "standard" | "recap" | "detail";
  className?: string;
};

export function CardTypeBadge({ cardType, className }: CardTypeBadgeProps) {
  if (!cardType || cardType === "standard") return null;

  if (cardType === "recap") {
    return (
      <Badge variant="default" className={cn("bg-primary", className)}>
        <ListChecks className="mr-1 size-3" />
        Récap
      </Badge>
    );
  }

  if (cardType === "detail") {
    return (
      <Badge variant="secondary" className={className}>
        <FileText className="mr-1 size-3" />
        Détail
      </Badge>
    );
  }

  return null;
}
