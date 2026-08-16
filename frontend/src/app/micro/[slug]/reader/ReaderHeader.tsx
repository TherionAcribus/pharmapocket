"use client";

import * as React from "react";
import Link from "next/link";
import {
  MoreHorizontal as MoreHorizontalIcon,
  Star as StarIcon,
  Text as TextIcon,
  Book as BookIcon,
  BookOpen as BookOpenIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const SAVE_LONG_PRESS_MS = 550;

export type ReaderMessage = {
  text: string;
  /** Sortie proposée avec le message, quand il annonce un blocage. */
  action?: { label: string; href: string };
};

type ReaderHeaderProps = {
  isLoggedIn: boolean;
  saved: boolean;
  isRead: boolean;
  hasDetails: boolean;
  message: ReaderMessage | null;
  onBack: () => void;
  onToggleTextSize: () => void;
  onToggleSaved: () => void;
  onToggleRead: () => void;
  onOpenDeckPicker: () => void;
  onOpenDetails: () => void;
};

/**
 * Barre d'actions de la fiche.
 *
 * L'appui long (ou le clic droit) sur l'étoile ouvre le choix de deck plutôt
 * que de basculer la sauvegarde.
 */
export function ReaderHeader({
  isLoggedIn,
  saved,
  isRead,
  hasDetails,
  message,
  onBack,
  onToggleTextSize,
  onToggleSaved,
  onToggleRead,
  onOpenDeckPicker,
  onOpenDetails,
}: ReaderHeaderProps) {
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressTriggeredRef = React.useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  React.useEffect(() => clearLongPressTimer, []);

  const onSavePointerDown = () => {
    if (!isLoggedIn) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onOpenDeckPicker();
    }, SAVE_LONG_PRESS_MS);
  };

  const onSaveClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onToggleSaved();
  };

  const onSaveContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onOpenDeckPicker();
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-2">
        <Button type="button" variant="ghost" size="icon" aria-label="Retour" onClick={onBack}>
          ←
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Taille du texte"
          onClick={onToggleTextSize}
        >
          <TextIcon className="size-5" />
        </Button>

        <Button
          variant={saved ? "secondary" : "ghost"}
          size="icon"
          aria-label="Sauvegarder"
          className={!isLoggedIn ? "opacity-40" : ""}
          onPointerDown={onSavePointerDown}
          onPointerUp={clearLongPressTimer}
          onPointerLeave={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
          onContextMenu={onSaveContextMenu}
          onClick={onSaveClick}
        >
          <StarIcon className="size-5" fill={saved ? "currentColor" : "none"} />
        </Button>

        <Button
          variant={isRead ? "secondary" : "ghost"}
          size="icon"
          aria-label="Marquer comme lu"
          className={!isLoggedIn ? "opacity-40" : ""}
          title={isRead ? "Marquer comme non lue" : "Marquer comme lue"}
          onClick={onToggleRead}
        >
          {isRead ? <BookIcon className="size-5" /> : <BookOpenIcon className="size-5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Plus"
          onClick={onOpenDetails}
          disabled={!hasDetails}
        >
          <MoreHorizontalIcon className="size-5" />
        </Button>
      </div>

      {message ? (
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2 text-xs text-muted-foreground">
          <span>{message.text}</span>
          {message.action ? (
            <Link
              href={message.action.href}
              className="font-medium text-primary underline underline-offset-2"
            >
              {message.action.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
