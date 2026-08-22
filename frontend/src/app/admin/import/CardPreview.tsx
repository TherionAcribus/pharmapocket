"use client";

import * as React from "react";

import { SeeMoreRenderer } from "@/components/SeeMoreRenderer";
import { Badge } from "@/components/ui/badge";
import { sanitizeEditorialHtmlWithDom } from "@/lib/sanitizeHtml";
import type { StreamBlock } from "@/lib/types";

/** Cibles éditoriales rappelées à l'écran ; l'import ne refuse pas au-delà. */
const ANSWER_EXPRESS_TARGET = 350;
const TAKEAWAY_TARGET = 200;
const KEY_POINT_LIMIT = 90;

type RawCard = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function plainLength(html: string): number {
  return sanitizeEditorialHtmlWithDom(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim().length;
}

function Counter({ length, target }: { length: number; target: number }) {
  const over = length > target;
  return (
    <span className={over ? "text-destructive" : "text-muted-foreground"}>
      {length} / {target} car.
    </span>
  );
}

function Html({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeEditorialHtmlWithDom(html) }}
    />
  );
}

/**
 * Reconstitue le `see_more` tel que l'API le sert : `answer_detail` en tête,
 * puis les blocs structurés, puis les sources. L'aperçu montre donc l'ordre réel
 * de lecture, pas l'ordre du JSON.
 */
function buildSeeMore(card: RawCard): StreamBlock[] {
  const blocks: StreamBlock[] = [];

  const detail = asString(card.answer_detail);
  if (detail.trim()) blocks.push({ type: "detail", value: sanitizeEditorialHtmlWithDom(detail) });

  for (const block of asArray(card.see_more)) {
    if (!block || typeof block !== "object") continue;
    const { type, value } = block as { type?: unknown; value?: unknown };
    if (typeof type !== "string") continue;
    blocks.push({
      type,
      value: type === "detail" ? sanitizeEditorialHtmlWithDom(asString(value)) : value,
    });
  }

  const sources = asArray(card.sources);
  if (sources.length) blocks.push({ type: "references", value: sources });

  return blocks;
}

function CardBlock({ card, index }: { card: RawCard; index: number }) {
  const title = asString(card.title) || `Carte #${index + 1}`;
  const answerExpress = asString(card.answer_express);
  const takeaway = asString(card.takeaway);
  const keyPoints = asArray(card.key_points).filter(
    (p): p is string => typeof p === "string"
  );
  const tags = asArray(card.tags).filter((t): t is string => typeof t === "string");
  const cardType = asString(card.card_type) || "standard";
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{cardType}</Badge>
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      <h2 className="text-lg font-semibold leading-snug">{title}</h2>

      <div className="space-y-1">
        <Html
          html={answerExpress}
          className="prose prose-zinc max-w-none text-base dark:prose-invert"
        />
        <div className="text-[11px]">
          <Counter length={plainLength(answerExpress)} target={ANSWER_EXPRESS_TARGET} />
        </div>
      </div>

      {keyPoints.length ? (
        <ul className="space-y-1 text-sm">
          {keyPoints.map((point, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span aria-hidden>•</span>
              <span>
                {point}
                {point.length > KEY_POINT_LIMIT ? (
                  <span className="ml-1 text-[11px] text-destructive">
                    ({point.length} / {KEY_POINT_LIMIT} car.)
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {takeaway.trim() ? (
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs font-semibold text-muted-foreground">À retenir</div>
          <Html html={takeaway} className="prose prose-sm max-w-none dark:prose-invert" />
          <div className="mt-1 text-[11px]">
            <Counter length={plainLength(takeaway)} target={TAKEAWAY_TARGET} />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium underline underline-offset-4"
      >
        {open ? "Masquer les détails" : "Voir détails & sources"}
      </button>

      {open ? <SeeMoreRenderer seeMore={buildSeeMore(card)} /> : null}
    </div>
  );
}

/**
 * Aperçu éditorial du JSON collé. Le dry-run dit si la structure passe ; c'est
 * ici qu'on juge si la carte se lit — ce qu'aucune validation ne peut faire.
 */
export function CardPreview({ raw }: { raw: string }) {
  const cards = React.useMemo<RawCard[] | null>(() => {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.filter((c): c is RawCard => Boolean(c) && typeof c === "object");
    } catch {
      return null;
    }
  }, [raw]);

  if (cards === null) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        JSON incomplet ou invalide : l&apos;aperçu s&apos;affichera dès qu&apos;il sera
        analysable.
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Aucune carte à prévisualiser.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">Aperçu ({cards.length})</div>
      <p className="text-xs text-muted-foreground">
        Rendu tel que le verra l&apos;utilisateur, HTML nettoyé comme à
        l&apos;enregistrement. Les compteurs rappellent les cibles éditoriales.
      </p>
      <div className="grid gap-3">
        {cards.map((card, index) => (
          <CardBlock key={index} card={card} index={index} />
        ))}
      </div>
    </div>
  );
}
