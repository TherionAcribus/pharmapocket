"use client";

import * as React from "react";

import { useToggleSaved } from "@/lib/queries";
import {
  addLessonTime,
  getLocalReadState,
  isManuallyUnread,
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

/** Temps passé sur la fiche, onglet visible, avant qu'elle compte comme lue. */
const AUTO_READ_DELAY_MS = 5000;

/** Part de la page atteinte au défilement qui vaut lecture, sans attendre. */
const AUTO_READ_SCROLL_RATIO = 0.6;

/**
 * Marque la fiche lue quand elle a vraiment été lue : soit `AUTO_READ_DELAY_MS`
 * passées à l'écran (le compte s'arrête quand l'onglet passe en arrière-plan),
 * soit un défilement jusqu'à `AUTO_READ_SCROLL_RATIO` de la page.
 *
 * Le simple montage ne suffit pas : un aller-retour dans le deck, un remontage
 * ou un préchargement ne doivent pas marquer une fiche à peine entrevue.
 * `enabled` est faux dès que la question ne se pose plus (visiteur déconnecté,
 * fiche déjà lue, fiche dé-marquée à la main).
 */
function useAutoRead({
  cardId,
  enabled,
  onRead,
}: {
  cardId: number;
  enabled: boolean;
  onRead: () => void;
}) {
  // Le callback change à chaque rendu ; on le lit via une ref pour ne pas
  // réarmer le minuteur (et donc repartir de zéro) à chaque rendu du lecteur.
  const onReadRef = React.useRef(onRead);
  React.useEffect(() => {
    onReadRef.current = onRead;
  });

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let remainingMs = AUTO_READ_DELAY_MS;
    let startedAt = Date.now();
    let timer: number | null = null;
    let done = false;

    const clearTimer = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const finish = () => {
      if (done) return;
      done = true;
      clearTimer();
      setLessonCompletion(cardId, true);
      scheduleProgressSync("auto_read");
      onReadRef.current();
    };

    const startTimer = () => {
      if (done || timer !== null) return;
      startedAt = Date.now();
      timer = window.setTimeout(finish, remainingMs);
    };

    const pauseTimer = () => {
      if (timer === null) return;
      clearTimer();
      remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") startTimer();
      else pauseTimer();
    };

    const onScroll = () => {
      if (done) return;
      const scrolled = window.scrollY;
      // Sans ce garde-fou, une fiche trop courte pour défiler satisfait le
      // ratio dès le premier événement et on retombe sur le « lu » immédiat.
      if (scrolled <= 0) return;
      const total = document.documentElement.scrollHeight;
      if (total <= 0) return;
      if ((scrolled + window.innerHeight) / total >= AUTO_READ_SCROLL_RATIO) finish();
    };

    if (document.visibilityState === "visible") startTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", onScroll);
    };
  }, [cardId, enabled]);
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
 * `data` est la seule entrée serveur : le détail porte déjà `is_saved` et
 * `is_read` (la page les demande avec la session), donc aucune requête par
 * carte ne vient les redemander. L'état local ne sert qu'à l'optimisme.
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
  showLoginPrompt,
}: {
  data: MicroArticleDetail;
  isLoggedIn: boolean;
  showMessage: (text: string) => void;
  /** Comme `showMessage`, mais le message porte le lien de connexion. */
  showLoginPrompt: (text: string) => void;
}): CardActions {
  const [saved, setSaved] = React.useState(false);
  const [isRead, setIsRead] = React.useState(false);
  const [manuallyUnread, setManuallyUnread] = React.useState(false);

  const toggleSavedMutation = useToggleSaved();

  React.useEffect(() => {
    setSaved(Boolean(data.is_saved));
  }, [data.slug, data.is_saved]);

  // `data.is_read` vient du serveur, qui peut être en retard d'un cycle de sync :
  // le store local fait foi dès qu'il connaît la fiche.
  React.useEffect(() => {
    setIsRead(getLocalReadState(data.id) ?? Boolean(data.is_read));
    setManuallyUnread(isManuallyUnread(data.id));
  }, [data.slug, data.id, data.is_read]);

  // Lire la fiche vaut lecture — pas l'ouvrir. Une seule écriture : le store
  // local, que le sync remonte ensuite dans `LessonProgress`, l'unique source
  // de vérité. Un « non lu » explicite désarme définitivement l'automatisme
  // pour cette fiche, jusqu'à ce que l'utilisateur la remarque lue lui-même.
  useAutoRead({
    cardId: data.id,
    enabled: isLoggedIn && !isRead && !manuallyUnread,
    onRead: () => setIsRead(true),
  });

  const toggleSaved = async (source: "button" | "double_tap") => {
    if (!isLoggedIn) {
      showLoginPrompt("Connecte-toi pour sauvegarder cette carte.");
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
      showLoginPrompt("Connecte-toi pour marquer lu / non lu.");
      return;
    }

    const next = !isRead;
    setIsRead(next);
    setManuallyUnread(!next);
    setLessonCompletion(data.id, next, { explicit: true });
    scheduleProgressSync("toggle_read");
    showMessage(next ? "Carte marquée comme lue." : "Carte marquée comme non lue.");
  };

  return { saved, isRead, toggleSaved, toggleRead };
}
