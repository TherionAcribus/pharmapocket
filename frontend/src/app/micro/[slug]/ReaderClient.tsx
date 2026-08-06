"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useMe } from "@/lib/queries";
import type { MicroArticleDetail } from "@/lib/types";

import { DeckPickerSheet } from "./reader/DeckPickerSheet";
import { ReaderCard } from "./reader/ReaderCard";
import { ReaderDetailsSheet } from "./reader/ReaderDetailsSheet";
import { ReaderFooter } from "./reader/ReaderFooter";
import { ReaderHeader } from "./reader/ReaderHeader";
import { readReturnToFromSession } from "./reader/readerSession";
import { useSeeMoreSections } from "./reader/seeMoreSections";
import { useDeckNavigation } from "./reader/useDeckNavigation";
import { useCardActions, useLessonProgressTracking } from "./reader/useReaderCardState";
import { useReaderGestures } from "./reader/useReaderGestures";

const MESSAGE_DURATION_MS = 1800;

/**
 * Lecteur d'une fiche.
 *
 * Ce composant n'assemble que les pièces : l'état de lecture, la navigation
 * dans le deck et les panneaux vivent dans `./reader/`.
 */
export default function ReaderClient({ data }: { data: MicroArticleDetail }) {
  const router = useRouter();

  const { data: me } = useMe();
  const isLoggedIn = Boolean(me?.email);

  const returnTo = React.useMemo(() => readReturnToFromSession(), []);

  const [openDetails, setOpenDetails] = React.useState(false);
  const [deckPickerOpen, setDeckPickerOpen] = React.useState(false);
  const [largeText, setLargeText] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const showMessage = React.useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), MESSAGE_DURATION_MS);
  }, []);

  useLessonProgressTracking(data.id, isLoggedIn);

  const sections = useSeeMoreSections(data);
  const { saved, isRead, isReadLoading, toggleSaved, toggleRead } = useCardActions({
    data,
    isLoggedIn,
    showMessage,
  });
  const { deck, positionText, goRelative, cardMotion } = useDeckNavigation({
    slug: data.slug,
    cardId: data.id,
    isLoggedIn,
  });

  const openDeckPicker = React.useCallback(() => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour sauvegarder cette carte.");
      return;
    }
    setDeckPickerOpen(true);
  }, [isLoggedIn, showMessage]);

  const gestures = useReaderGestures({
    enabled: !deckPickerOpen && !openDetails,
    hasDetails: sections.hasDetails,
    onOpenDetails: () => setOpenDetails(true),
    onDoubleTap: () => void toggleSaved("double_tap"),
    onSwipeHorizontal: goRelative,
  });

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenDetails(false);
        return;
      }
      if (openDetails) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRelative(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRelative(+1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDetails, goRelative]);

  const onBack = () => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    try {
      router.back();
    } catch {
      router.push("/discover");
    }
  };

  return (
    <div
      className="min-h-dvh bg-background"
      onTouchStart={gestures.onTouchStart}
      onTouchEnd={gestures.onTouchEnd}
    >
      <ReaderHeader
        isLoggedIn={isLoggedIn}
        saved={saved}
        isRead={isRead}
        isReadLoading={isReadLoading}
        hasDetails={sections.hasDetails}
        message={message}
        onBack={onBack}
        onToggleTextSize={() => setLargeText((v) => !v)}
        onToggleSaved={() => void toggleSaved("button")}
        onToggleRead={() => void toggleRead()}
        onOpenDeckPicker={openDeckPicker}
        onOpenDetails={() => setOpenDetails(true)}
      />

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className={largeText ? "space-y-3 text-[1.05rem]" : "space-y-3"}>
          <ReaderCard
            data={data}
            sections={sections}
            largeText={largeText}
            motion={cardMotion}
            onOpenDetails={() => setOpenDetails(true)}
          />
        </div>
      </main>

      <ReaderFooter
        positionText={positionText}
        hasDeck={Boolean(deck?.slugs?.length)}
        onPrev={() => goRelative(-1)}
        onNext={() => goRelative(+1)}
      />

      <ReaderDetailsSheet
        open={openDetails}
        onOpenChange={setOpenDetails}
        data={data}
        sections={sections}
      />

      <DeckPickerSheet
        open={deckPickerOpen}
        onOpenChange={setDeckPickerOpen}
        cardId={data.id}
        enabled={isLoggedIn}
        onError={showMessage}
      />
    </div>
  );
}
