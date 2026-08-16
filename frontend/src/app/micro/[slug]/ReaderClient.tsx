"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useLoginHref } from "@/lib/authRedirect";
import { useMe } from "@/lib/queries";
import type { MicroArticleDetail } from "@/lib/types";

import { DeckPickerSheet } from "./reader/DeckPickerSheet";
import { ReaderCard } from "./reader/ReaderCard";
import { ReaderDetailsSheet } from "./reader/ReaderDetailsSheet";
import { ReaderFooter } from "./reader/ReaderFooter";
import { ReaderHeader, type ReaderMessage } from "./reader/ReaderHeader";
import { readReturnToFromSession } from "./reader/readerSession";
import { useSeeMoreSections } from "./reader/seeMoreSections";
import { useDeckNavigation } from "./reader/useDeckNavigation";
import { useCardActions, useLessonProgressTracking } from "./reader/useReaderCardState";
import { useReaderGestures } from "./reader/useReaderGestures";

const MESSAGE_DURATION_MS = 1800;

/** Un message qui propose un lien doit rester assez longtemps pour être cliqué. */
const ACTIONABLE_MESSAGE_DURATION_MS = 8000;

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
  const [message, setMessage] = React.useState<ReaderMessage | null>(null);

  const loginHref = useLoginHref();

  // Sans cette ref, le minuteur d'un message déjà affiché effacerait le suivant
  // avant l'heure — de quoi escamoter un lien de connexion à peine apparu.
  const messageTimerRef = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    },
    []
  );

  const showReaderMessage = React.useCallback((next: ReaderMessage) => {
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    setMessage(next);
    messageTimerRef.current = window.setTimeout(
      () => setMessage(null),
      next.action ? ACTIONABLE_MESSAGE_DURATION_MS : MESSAGE_DURATION_MS
    );
  }, []);

  const showMessage = React.useCallback(
    (text: string) => showReaderMessage({ text }),
    [showReaderMessage]
  );

  /** Action réservée aux comptes : le message porte le lien de connexion. */
  const showLoginPrompt = React.useCallback(
    (text: string) =>
      showReaderMessage({ text, action: { label: "Se connecter", href: loginHref } }),
    [loginHref, showReaderMessage]
  );

  useLessonProgressTracking(data.id, isLoggedIn);

  const sections = useSeeMoreSections(data);
  const { saved, isRead, toggleSaved, toggleRead } = useCardActions({
    data,
    isLoggedIn,
    showMessage,
    showLoginPrompt,
  });
  const { deck, positionText, goRelative, cardMotion } = useDeckNavigation({
    slug: data.slug,
    cardId: data.id,
    isLoggedIn,
  });

  const openDeckPicker = React.useCallback(() => {
    if (!isLoggedIn) {
      showLoginPrompt("Connecte-toi pour ranger cette carte dans un deck.");
      return;
    }
    setDeckPickerOpen(true);
  }, [isLoggedIn, showLoginPrompt]);

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
        hasDetails={sections.hasDetails}
        message={message}
        onBack={onBack}
        onToggleTextSize={() => setLargeText((v) => !v)}
        onToggleSaved={() => void toggleSaved("button")}
        onToggleRead={toggleRead}
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
