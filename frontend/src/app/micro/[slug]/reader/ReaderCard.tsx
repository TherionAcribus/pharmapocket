"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronUp as ChevronUpIcon } from "lucide-react";

import { ThemeIcon, resolveGeneratedThumbMetaWithOverrides } from "@/components/GeneratedThumb";
import { CardTypeBadge, ParentRecapLinks, RecapPointsList } from "@/components/SubjectNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useThumbOverrides } from "@/lib/thumbOverrides";
import { cn } from "@/lib/utils";
import type { MicroArticleDetail } from "@/lib/types";

import { RichText } from "@/components/RichText";
import type { SeeMoreSections } from "./seeMoreSections";

const LONG_PREVIEW_MAX_HEIGHT = 120;
const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "")) ||
  "";

function normalizeImageUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (!API_BASE) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function CreditLine({
  creditText,
  sourceUrl,
  license,
  licenseUrl,
}: {
  creditText?: string | null;
  sourceUrl?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
}) {
  if (!creditText && !license) return null;
  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      {creditText ? (
        sourceUrl ? (
          <Link href={sourceUrl} target="_blank" className="underline">
            {creditText}
          </Link>
        ) : (
          creditText
        )
      ) : null}
      {license ? (
        <>
          {creditText ? " " : ""}
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
  );
}

/**
 * Aperçu du contenu long, tronqué par un dégradé tant qu'il dépasse.
 *
 * La troncature est mesurée après rendu : la hauteur réelle dépend de la
 * police, de la largeur et du HTML éditorial.
 */
function LongPreview({
  html,
  slug,
  largeText,
}: {
  html?: string;
  slug: string;
  largeText: boolean;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = React.useState<number | null>(LONG_PREVIEW_MAX_HEIGHT);
  const [isTruncated, setIsTruncated] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      setMaxHeight(LONG_PREVIEW_MAX_HEIGHT);
      requestAnimationFrame(() => {
        const nextEl = ref.current;
        if (!nextEl) return;
        const isOverflowing = nextEl.scrollHeight > nextEl.clientHeight + 1;
        setIsTruncated(isOverflowing);
        if (!isOverflowing) setMaxHeight(null);
      });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [slug, html, largeText]);

  if (!html) return null;

  return (
    <div className="relative mt-4">
      <div
        ref={ref}
        className="prose prose-zinc max-w-none text-sm text-muted-foreground dark:prose-invert"
        style={maxHeight ? { maxHeight, overflow: "hidden" } : undefined}
      >
        <RichText html={html} />
      </div>
      {isTruncated ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-card" />
      ) : null}
    </div>
  );
}

type ReaderCardProps = {
  data: MicroArticleDetail;
  sections: SeeMoreSections;
  largeText: boolean;
  motion: { className: string; style: React.CSSProperties | undefined };
  onOpenDetails: () => void;
};

export function ReaderCard({
  data,
  sections,
  largeText,
  motion,
  onOpenDetails,
}: ReaderCardProps) {
  const { overrides } = useThumbOverrides();
  const { blocks, detailBlocks, hasDetails } = sections;

  const inlineIllustrationUrl = React.useMemo(() => {
    if (data.cover_image_url) return normalizeImageUrl(data.cover_image_url);
    const imageBlock = blocks.find((b) => b?.type === "image");
    const v = imageBlock && typeof imageBlock.value === "object" ? (imageBlock.value as Record<string, unknown>) : null;
    const image = v && typeof v.image === "object" ? (v.image as Record<string, unknown>) : null;
    const url = image && typeof image.url === "string" ? normalizeImageUrl(image.url) : null;
    return url;
  }, [blocks, data.cover_image_url]);

  const coverCredit = React.useMemo(() => {
    const img = data.cover_image;
    if (!img) return null;
    return {
      creditText: typeof img.credit_text === "string" ? img.credit_text : null,
      sourceUrl: typeof img.credit_source_url === "string" ? img.credit_source_url : null,
      license: typeof img.credit_license === "string" ? img.credit_license : null,
      licenseUrl: typeof img.credit_license_url === "string" ? img.credit_license_url : null,
    };
  }, [data.cover_image]);

  const primaryCategory = React.useMemo(() => {
    const fromPayload =
      data.categories_pharmacologie_payload?.[0] ||
      data.categories_maladies_payload?.[0] ||
      data.categories_theme_payload?.[0];
    if (fromPayload?.name) return fromPayload.name;

    const fromStrings =
      data.categories_pharmacologie?.[0] || data.categories_maladies?.[0] || data.categories_theme?.[0];
    return fromStrings || null;
  }, [
    data.categories_maladies,
    data.categories_maladies_payload,
    data.categories_pharmacologie,
    data.categories_pharmacologie_payload,
    data.categories_theme,
    data.categories_theme_payload,
  ]);

  const longPreviewHtml = React.useMemo(() => {
    const firstDetail = detailBlocks.find((b) => b?.type === "detail");
    if (firstDetail && typeof firstDetail.value === "string" && firstDetail.value.trim()) {
      return firstDetail.value;
    }
    return data.takeaway;
  }, [detailBlocks, data.takeaway]);

  const publishedLabel = React.useMemo(() => {
    if (!data.published_at) return null;
    const dt = new Date(data.published_at);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString();
  }, [data.published_at]);

  const headerMeta = React.useMemo(
    () =>
      resolveGeneratedThumbMetaWithOverrides(
        {
          categories_theme_payload: data.categories_theme_payload,
          categories_maladies_payload: data.categories_maladies_payload,
          categories_medicament_payload: data.categories_medicament_payload,
        },
        overrides
      ),
    [
      data.categories_maladies_payload,
      data.categories_medicament_payload,
      data.categories_theme_payload,
      overrides,
    ]
  );

  return (
    <div
      className={cn("rounded-2xl border bg-card p-5 shadow-sm", motion.className)}
      style={
        {
          viewTransitionName: "pp-reader-card",
          ...(motion.style ?? null),
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <CardTypeBadge cardType={data.card_type} />
        {headerMeta.labelRaw ? (
          <Badge
            variant="secondary"
            className="max-w-full truncate border-transparent"
            style={{
              backgroundColor: headerMeta.visual.bg,
              color: "rgba(255,255,255,0.96)",
            }}
          >
            <ThemeIcon theme={headerMeta.theme} size={14} />
            <span className="truncate">{headerMeta.labelRaw}</span>
          </Badge>
        ) : primaryCategory ? (
          <Badge variant="secondary" className="max-w-full truncate">
            {primaryCategory}
          </Badge>
        ) : null}
        {publishedLabel ? <div>Publié le {publishedLabel}</div> : null}
      </div>

      <div className="mt-3 text-2xl font-semibold leading-snug">{data.title}</div>

      <div className="mt-3 space-y-3">
        <div className="relative">
          <RichText
            html={data.answer_express}
            className={cn(
              "prose prose-zinc max-w-none text-[1.05rem] leading-relaxed text-foreground dark:prose-invert",
              largeText ? "text-[1.15rem]" : ""
            )}
          />
        </div>

        {inlineIllustrationUrl ? (
          <div>
            <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
              <Image
                src={inlineIllustrationUrl}
                alt={data.title}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
              />
            </div>
            <CreditLine
              creditText={coverCredit?.creditText ?? data.cover_image_credit ?? null}
              sourceUrl={coverCredit?.sourceUrl ?? null}
              license={coverCredit?.license ?? null}
              licenseUrl={coverCredit?.licenseUrl ?? null}
            />
          </div>
        ) : null}
      </div>

      <LongPreview html={longPreviewHtml} slug={data.slug} largeText={largeText} />

      {data.key_points?.length ? (
        <div className="mt-4 flex flex-wrap gap-1">
          {data.key_points.slice(0, 3).map((p) => (
            <Badge key={p} variant="secondary" className="max-w-full truncate">
              {p}
            </Badge>
          ))}
        </div>
      ) : null}

      {data.card_type === "recap" && data.recap_points?.length ? (
        <RecapPointsList points={data.recap_points} className="mt-4" />
      ) : null}

      {data.parent_recap_cards?.length ? (
        <ParentRecapLinks recapCards={data.parent_recap_cards} className="mt-4" />
      ) : null}

      {hasDetails ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            className="mx-auto flex items-center justify-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
            onClick={onOpenDetails}
            aria-label="Glisser pour ouvrir les détails et sources"
          >
            <span>Glisser pour détails & sources</span>
            <ChevronUpIcon className="size-4" />
          </button>

          <Button type="button" className="w-full" onClick={onOpenDetails}>
            Voir détails & sources
          </Button>
        </div>
      ) : null}
    </div>
  );
}
