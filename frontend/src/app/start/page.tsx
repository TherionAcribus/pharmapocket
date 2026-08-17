"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check as CheckIcon,
  ChevronDown as ChevronDownIcon,
  Lock as LockIcon,
} from "lucide-react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { useLoginHref, useSignupHref } from "@/lib/authRedirect";
import { getLocalProgressState } from "@/lib/progressStore";
import { useDecks, useMe, useSrsCounts } from "@/lib/queries";
import { availableCount, pluralCards, REVIEW_DEFAULT_SCOPE } from "@/lib/review";
import { cn } from "@/lib/utils";

/**
 * `locked` n'est pas un simple « désactivé » : l'étape reste lisible, mais son
 * action ne peut rien produire tant que la précédente n'est pas faite (réviser
 * sans carte sauvegardée renvoie une file vide, ce qui se lit comme un bug).
 */
type StepState = "todo" | "done" | "locked";

function StepMarker({ index, state }: { index: number; state: StepState }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckIcon className="size-4" />
      </span>
    );
  }
  if (state === "locked") {
    return (
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground">
        <LockIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums">
      {index}
    </span>
  );
}

function StepCard({
  index,
  state,
  title,
  description,
  children,
}: {
  index: number;
  state: StepState;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("rounded-xl border bg-card p-4", state === "locked" ? "opacity-70" : "")}
      aria-disabled={state === "locked" ? true : undefined}
    >
      <div className="flex items-start gap-3">
        <StepMarker index={index} state={state} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export default function StartPage() {
  const { data: me, isPending: loadingUser } = useMe();
  const isLoggedIn = Boolean(me);

  const { data: decks = [], isPending: loadingDecks } = useDecks(isLoggedIn);
  const savedCount = decks.reduce((sum, d) => sum + (d.cards_count ?? 0), 0);
  const hasSavedCards = savedCount > 0;

  // Même clé de cache que le badge de l'onglet « À revoir » : ce comptage est
  // déjà en vol dès que l'utilisateur est connecté, il ne coûte rien ici.
  const { data: counts } = useSrsCounts({ scope: REVIEW_DEFAULT_SCOPE }, isLoggedIn && hasSavedCards);
  const dueCount = availableCount(counts);

  // La lecture d'une fiche vit dans le store local, donc côté client seulement :
  // on la lit après montage pour ne pas faire diverger le rendu serveur.
  const [hasLocalRead, setHasLocalRead] = React.useState(false);
  React.useEffect(() => {
    const lessons = Object.values(getLocalProgressState().lessons);
    setHasLocalRead(lessons.some((l) => l.seen || l.completed));
  }, []);

  const loadingState = loadingUser || (isLoggedIn && loadingDecks);
  // Sauvegarder une carte suppose de l'avoir ouverte : inutile de renvoyer un
  // habitué à l'étape 1 parce qu'il a changé d'appareil.
  const hasReadCard = hasLocalRead || hasSavedCards;

  const loginHref = useLoginHref();
  const signupHref = useSignupHref();

  const readState: StepState = hasReadCard ? "done" : "todo";

  const accountState: StepState = isLoggedIn ? "done" : "todo";
  const saveState: StepState = hasSavedCards ? "done" : "todo";

  const reviewState: StepState = loadingState || !isLoggedIn || !hasSavedCards ? "locked" : "todo";
  const reviewBlockedReason = !isLoggedIn
    ? "Crée ton compte et sauvegarde une carte pour lancer une session."
    : "Sauvegarde au moins une carte : la session se construit à partir de tes decks.";

  // « Déjà lancé » : le compte existe et les decks ne sont pas vides. Les étapes
  // n'ont plus rien à apprendre à cet utilisateur, elles passent derrière un
  // repli plutôt que de disparaître — /start reste atteignable volontairement.
  const onboarded = isLoggedIn && hasSavedCards;
  const [stepsOpen, setStepsOpen] = React.useState(false);
  const showSteps = !onboarded || stepsOpen;

  const steps = (
    <div className="space-y-4">
      <StepCard
        index={1}
        state={readState}
        title="Lis une carte"
        description="Commence par une dose du jour ou un sujet de la bibliothèque."
      >
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="secondary">
            <Link href="/discover">Dose du jour</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/library">Bibliothèque</Link>
          </Button>
        </div>
      </StepCard>

      {isLoggedIn ? (
        <StepCard
          index={2}
          state={saveState}
          title="Sauvegarde dans tes decks"
          description={
            hasSavedCards
              ? `${pluralCards(savedCount)} dans tes decks. Ajoutes-en quand une fiche compte.`
              : "Ajoute les cartes importantes à « Mes cartes » pour les retrouver et les réviser."
          }
        >
          <Button asChild variant="secondary" className="w-full">
            <Link href={hasSavedCards ? "/cards" : "/packs"}>
              {hasSavedCards ? "Voir mes cartes" : "Choisir un pack"}
            </Link>
          </Button>
        </StepCard>
      ) : (
        <StepCard
          index={2}
          state={accountState}
          title="Crée ton compte"
          description="Sans compte, rien n'est gardé : le compte conserve tes cartes, ta progression et tes révisions."
        >
          <div className="grid grid-cols-2 gap-2">
            <Button asChild>
              <Link href={signupHref}>Créer un compte</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={loginHref}>Se connecter</Link>
            </Button>
          </div>
        </StepCard>
      )}

      <StepCard
        index={3}
        state={reviewState}
        title="Révise 5 minutes"
        description={
          reviewState === "locked"
            ? loadingState
              ? "Chargement…"
              : reviewBlockedReason
            : dueCount > 0
              ? `${pluralCards(dueCount)} à revoir maintenant.`
              : "Rien à revoir dans l'immédiat : les cartes reviendront à leur échéance."
        }
      >
        {reviewState === "locked" ? (
          <Button variant="secondary" className="w-full" disabled>
            Démarrer une session
          </Button>
        ) : (
          <Button asChild variant={dueCount > 0 ? "default" : "secondary"} className="w-full">
            <Link href="/review">
              {dueCount > 0 ? "Démarrer une session" : "Ouvrir les révisions"}
            </Link>
          </Button>
        )}
      </StepCard>
    </div>
  );

  return (
    <MobileScaffold title="Commencer" contentClassName="space-y-4">
      {onboarded ? (
        <>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Tu es lancé</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {pluralCards(savedCount)} dans tes decks ·{" "}
                  {dueCount > 0 ? `${dueCount} à revoir maintenant` : "rien à revoir maintenant"}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button asChild variant={dueCount > 0 ? "default" : "secondary"}>
                <Link href="/review">{dueCount > 0 ? "Réviser" : "Mes révisions"}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/discover">Dose du jour</Link>
              </Button>
            </div>
          </div>

          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setStepsOpen((v) => !v)}
            aria-expanded={stepsOpen}
            aria-controls="start-steps"
          >
            <span className="min-w-0 flex-1 truncate">Revoir les étapes</span>
            <ChevronDownIcon
              className={cn("size-4 shrink-0 transition-transform", stepsOpen ? "rotate-180" : "")}
            />
          </button>
        </>
      ) : null}

      {showSteps ? <div id="start-steps">{steps}</div> : null}

      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold">Optionnel : Quiz</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Vérifie ta compréhension avec des questions.
        </div>
        <div className="mt-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/quiz">Aller au quiz</Link>
          </Button>
        </div>
      </div>
    </MobileScaffold>
  );
}
