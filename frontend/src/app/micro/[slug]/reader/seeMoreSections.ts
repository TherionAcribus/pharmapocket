"use client";

import * as React from "react";

import type { MicroArticleDetail, StreamBlock } from "@/lib/types";

export type SeeMoreSections = {
  blocks: StreamBlock[];
  detailBlocks: StreamBlock[];
  referenceBlocks: StreamBlock[];
  extraBlocks: StreamBlock[];
  hasLongContent: boolean;
  hasSources: boolean;
  hasExtra: boolean;
  /** Vrai dès qu'il y a matière à ouvrir le panneau « Détails & sources ». */
  hasDetails: boolean;
};

/** Répartit le stream `see_more` entre les sections du panneau de détails. */
export function useSeeMoreSections(data: MicroArticleDetail): SeeMoreSections {
  const blocks = React.useMemo(() => (data.see_more ?? []) as StreamBlock[], [data.see_more]);
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

  return {
    blocks,
    detailBlocks,
    referenceBlocks,
    extraBlocks,
    hasLongContent,
    hasSources,
    hasExtra,
    hasDetails: hasLongContent || hasSources || hasExtra,
  };
}
