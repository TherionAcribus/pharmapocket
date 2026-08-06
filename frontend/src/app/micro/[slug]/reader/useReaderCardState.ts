"use client";

import * as React from "react";

import { useSavedStatus, useSetReadState, useToggleSaved } from "@/lib/queries";
import { addLessonTime, markLessonSeen, setLessonCompletion } from "@/lib/progressStore";
import {
  ensureProgressSyncLoop,
  scheduleProgressSync,
  setProgressSyncEnabled,
} from "@/lib/progressSync";
import type { MicroArticleDetail } from "@/lib/types";

/** Vu / temps passé : écrit dans le store local, poussé au serveur si connecté. */
export function useLessonProgressTracking(cardId: number, isLoggedIn: boolean) {
  React.useEffect(() => {
    ensureProgressSyncLoop();
    setProgressSyncEnabled(isLoggedIn);
  }, [isLoggedIn]);

  React.useEffect(() => {
    markLessonSeen(cardId);
    if (isLoggedIn) scheduleProgressSync("lesson_seen");
  }, [cardId, isLoggedIn]);

  React.useEffect(() => {
    const startedAt = Date.now();
    return () => {
      const delta = Date.now() - startedAt;
      addLessonTime(cardId, delta);
      if (isLoggedIn) scheduleProgressSync("lesson_time");
    };
  }, [cardId, isLoggedIn]);
}

export type CardActions = {
  saved: boolean;
  isRead: boolean;
  isReadLoading: boolean;
  toggleSaved: (source: "button" | "double_tap") => Promise<void>;
  toggleRead: () => Promise<void>;
};

/**
 * Sauvegarde et état de lecture, en optimiste : l'icône bascule tout de suite
 * et repart en arrière si le serveur refuse.
 */
export function useCardActions({
  data,
  isLoggedIn,
  showMessage,
}: {
  data: MicroArticleDetail;
  isLoggedIn: boolean;
  showMessage: (text: string) => void;
}): CardActions {
  const [saved, setSaved] = React.useState(false);
  const [isRead, setIsRead] = React.useState(false);
  const [isReadLoading, setIsReadLoading] = React.useState(false);

  const toggleSavedMutation = useToggleSaved();
  const setReadStateMutation = useSetReadState();

  React.useEffect(() => {
    setSaved(Boolean(data.is_saved));
  }, [data.slug, data.is_saved]);

  React.useEffect(() => {
    setIsRead(Boolean(data.is_read));
  }, [data.slug, data.is_read]);

  const { data: savedStatus } = useSavedStatus(data.slug, isLoggedIn);

  React.useEffect(() => {
    if (!savedStatus) return;
    setSaved(Boolean(savedStatus.saved));
  }, [savedStatus]);

  // Ouvrir la fiche vaut lecture : on l'affiche tout de suite et on prévient
  // le serveur en arrière-plan.
  React.useEffect(() => {
    if (!isLoggedIn) return;
    setIsRead(true);
    setLessonCompletion(data.id, true);
    scheduleProgressSync("auto_read");
    setReadStateMutation.mutate({ slug: data.slug, isRead: true });
    // `setReadStateMutation` est recréé à chaque rendu : l'inclure relancerait
    // la requête en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, data.slug, data.id]);

  const toggleSaved = async (source: "button" | "double_tap") => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour sauvegarder cette carte.");
      return;
    }

    const next = !saved;
    setSaved(next);
    try {
      await toggleSavedMutation.mutateAsync({ slug: data.slug, saved: next });
    } catch {
      setSaved(!next);
      showMessage(
        source === "button"
          ? "Impossible de sauvegarder pour le moment."
          : "Impossible de sauvegarder par double tap."
      );
    }
  };

  const toggleRead = async () => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour marquer lu / non lu.");
      return;
    }

    if (isReadLoading) return;
    const next = !isRead;
    setIsRead(next);
    setLessonCompletion(data.id, next);
    scheduleProgressSync("toggle_read");
    setIsReadLoading(true);
    try {
      await setReadStateMutation.mutateAsync({ slug: data.slug, isRead: next });
      showMessage(next ? "Carte marquée comme lue." : "Carte marquée comme non lue.");
    } catch {
      setIsRead(!next);
      showMessage("Impossible de mettre à jour l'état lu.");
    } finally {
      setIsReadLoading(false);
    }
  };

  return { saved, isRead, isReadLoading, toggleSaved, toggleRead };
}
