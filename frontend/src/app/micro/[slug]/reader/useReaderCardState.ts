"use client";

import * as React from "react";

import { useSavedStatus, useToggleSaved } from "@/lib/queries";
import {
  addLessonTime,
  getLocalReadState,
  markLessonSeen,
  setLessonCompletion,
} from "@/lib/progressStore";
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
  toggleSaved: (source: "button" | "double_tap") => Promise<void>;
  toggleRead: () => void;
};

/**
 * Sauvegarde et état de lecture.
 *
 * La sauvegarde est optimiste : l'étoile bascule tout de suite et repart en
 * arrière si le serveur refuse. L'état « lu » n'a en revanche pas de requête à
 * refuser : il s'écrit dans le store local (source unique côté client, remontée
 * dans `LessonProgress` par le sync), donc il ne repart jamais en arrière.
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

  const toggleSavedMutation = useToggleSaved();

  React.useEffect(() => {
    setSaved(Boolean(data.is_saved));
  }, [data.slug, data.is_saved]);

  // `data.is_read` vient du serveur, qui peut être en retard d'un cycle de sync :
  // le store local fait foi dès qu'il connaît la fiche.
  React.useEffect(() => {
    setIsRead(getLocalReadState(data.id) ?? Boolean(data.is_read));
  }, [data.slug, data.id, data.is_read]);

  const { data: savedStatus } = useSavedStatus(data.slug, isLoggedIn);

  React.useEffect(() => {
    if (!savedStatus) return;
    setSaved(Boolean(savedStatus.saved));
  }, [savedStatus]);

  // Ouvrir la fiche vaut lecture. Une seule écriture : le store local, que le
  // sync remonte ensuite dans `LessonProgress` — l'unique source de vérité.
  React.useEffect(() => {
    if (!isLoggedIn) return;
    setIsRead(true);
    setLessonCompletion(data.id, true);
    scheduleProgressSync("auto_read");
  }, [isLoggedIn, data.id]);

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

  // Écriture locale immédiate, jamais annulée : le sync est chargé de rattraper
  // le serveur (et retente tant que la leçon reste dans `pending`).
  const toggleRead = () => {
    if (!isLoggedIn) {
      showMessage("Connecte-toi pour marquer lu / non lu.");
      return;
    }

    const next = !isRead;
    setIsRead(next);
    setLessonCompletion(data.id, next);
    scheduleProgressSync("toggle_read");
    showMessage(next ? "Carte marquée comme lue." : "Carte marquée comme non lue.");
  };

  return { saved, isRead, toggleSaved, toggleRead };
}
