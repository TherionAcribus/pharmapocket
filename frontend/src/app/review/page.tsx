"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown as ChevronDownIcon, SlidersHorizontal as SlidersIcon } from "lucide-react";

import { LoginCta } from "@/components/LoginCta";
import { MobileScaffold } from "@/components/MobileScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useDecks, useMe, useRateSrsCard, useSrsCounts, useSrsNext } from "@/lib/queries";
import {
  availableCount,
  pluralCards,
  REVIEW_DEFAULT_ONLY_DUE,
  REVIEW_DEFAULT_SCOPE,
} from "@/lib/review";
import type { SrsNextQuery, SrsScope } from "@/lib/api/srs";
import type { SrsNext, SrsRating } from "@/lib/types";

function RichText({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Réglages d'une session. Regroupés en un seul état parce qu'ils changent
 * ensemble et qu'ils invalident tous la session en cours.
 */
type Filters = {
  scope: SrsScope;
  deckId: number | null;
  onlyDue: boolean;
};

/** Carte servie par la file. La file de rejeu en garde une copie locale. */
type ReviewCard = NonNullable<SrsNext["card"]>;

const DEFAULT_FILTERS: Filters = {
  scope: REVIEW_DEFAULT_SCOPE,
  deckId: null,
  onlyDue: REVIEW_DEFAULT_ONLY_DUE,
};

export default function ReviewPage() {
  const { data: me, isPending: loadingUser } = useMe();
  const isLoggedIn = Boolean(me);

  const { data: decks = [], isPending: loadingDecks } = useDecks(isLoggedIn);

  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);
  const { scope, deckId, onlyDue } = filters;

  React.useEffect(() => {
    if (!decks.length) return;
    // Pré-sélection silencieuse : elle ne fait que garnir l'option « Un deck »,
    // qui n'est pas le choix par défaut, donc elle n'interrompt aucune session.
    setFilters((prev) => {
      if (prev.deckId != null && decks.some((d) => d.id === prev.deckId)) return prev;
      const fallback = decks.find((d) => d.is_default) ?? decks[0];
      return fallback ? { ...prev, deckId: fallback.id } : prev;
    });
  }, [decks]);

  const [revealed, setRevealed] = React.useState(false);
  const [sessionCount, setSessionCount] = React.useState(0);
  // Cartes passées : retirées de la file *pour cette session seulement*, le
  // serveur n'en garde aucune trace et les resservira la prochaine fois.
  const [skipped, setSkipped] = React.useState<number[]>([]);
  // Cartes notées « À revoir » : leur échéance serveur repart à demain, mais on
  // les repropose avant la fin de la session, une fois la file épuisée.
  const [replay, setReplay] = React.useState<ReviewCard[]>([]);
  const [started, setStarted] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [scopeError, setScopeError] = React.useState<string | null>(null);

  const srsQuery = React.useMemo<SrsNextQuery>(
    () => ({
      scope,
      deck_id: scope === "deck" ? deckId : undefined,
      only_due: onlyDue,
      exclude_ids: skipped,
    }),
    [deckId, onlyDue, scope, skipped]
  );

  // La session ne démarre jamais toute seule : `started` n'est vrai qu'après un
  // clic sur « Démarrer », et retombe dès qu'un filtre change.
  const {
    data: current,
    isFetching: loadingCard,
    error: queryError,
  } = useSrsNext(srsQuery, isLoggedIn && started);

  const rateMutation = useRateSrsCard();

  const countsEnabled = isLoggedIn && (scope !== "deck" || deckId != null);
  const { data: counts, isPending: loadingCounts } = useSrsCounts(
    { scope, deck_id: scope === "deck" ? deckId : undefined },
    countsEnabled
  );

  const available = availableCount(counts);
  const laterCount = counts?.later ?? 0;
  const totalCount = counts?.total ?? 0;
  // Ce que la file peut servir avec les réglages courants : en mode « tout »,
  // les échéances futures rentrent aussi dans la session.
  const queueCount = onlyDue ? available : totalCount;
  // Ce que la session va encore servir, et non ce que la file contient : une
  // carte passée ne revient qu'à la session suivante, et une carte notée « À
  // revoir » ne compte plus comme due côté serveur alors qu'on va la rejouer.
  // En mode « tout », la file ne se vide pas — inutile d'y ajouter le rejeu.
  const remaining = Math.max(0, queueCount - skipped.length) + (onlyDue ? replay.length : 0);

  const requestError = queryError ?? rateMutation.error;
  const error = scopeError ?? requestError?.message ?? null;

  const serverCard = current?.card ?? null;
  // La file locale ne prend le relais qu'une fois le serveur à sec : une carte
  // ratée revient en fin de session, pas juste après.
  const activeCard = serverCard ?? replay[0] ?? null;

  const resetSession = () => {
    setStarted(false);
    setRevealed(false);
    setSessionCount(0);
    setSkipped([]);
    setReplay([]);
    setScopeError(null);
  };

  /** Sortir d'une session pour régler : les réglages doivent être visibles. */
  const backToOptions = () => {
    resetSession();
    setOptionsOpen(true);
  };

  /** Change un réglage : la session en cours ne décrit plus ce que l'on révise. */
  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    resetSession();
  };

  /** `patch` sert aux raccourcis qui démarrent *et* changent un réglage. */
  const startSession = (patch?: Partial<Filters>) => {
    if (!isLoggedIn) return;
    const next = { ...filters, ...patch };
    if (next.scope === "deck" && next.deckId == null) {
      setScopeError("Choisis un deck.");
      return;
    }
    if (patch) setFilters(next);
    setScopeError(null);
    setRevealed(false);
    setSessionCount(0);
    setSkipped([]);
    setReplay([]);
    setStarted(true);
  };

  const busy = loadingCard || rateMutation.isPending;

  const skipCard = () => {
    if (!activeCard || busy) return;
    setRevealed(false);
    if (!serverCard) {
      // Carte déjà rejouée : elle repart simplement en fin de file locale.
      setReplay((prev) => [...prev.filter((c) => c.id !== activeCard.id), activeCard]);
      return;
    }
    // Redemander la même requête redonnerait la même carte (la file est servie
    // par échéance puis par id) : c'est l'exclusion qui la fait avancer.
    setSkipped((prev) => (prev.includes(activeCard.id) ? prev : [...prev, activeCard.id]));
  };

  const onRate = async (rating: SrsRating) => {
    if (!activeCard || busy) return;
    const card = activeCard;
    try {
      await rateMutation.mutateAsync({ card_id: card.id, rating });
      setSessionCount((v) => v + 1);
      setRevealed(false);
      // « À revoir » remet la carte en fin de file locale — le serveur, lui, ne
      // la redonnera pas avant demain. Toute autre note l'en retire, y compris
      // quand on rattrape une carte déjà rejouée.
      setReplay((prev) => {
        const rest = prev.filter((c) => c.id !== card.id);
        return rating === "again" ? [...rest, card] : rest;
      });
    } catch {
      // `rateMutation.error` alimente déjà le bandeau d'erreur.
    }
  };

  const deckName = decks.find((d) => d.id === deckId)?.name;
  const scopeLabel =
    scope === "all_cards"
      ? "Toutes les cartes"
      : scope === "deck"
        ? deckName
          ? `Deck « ${deckName} »`
          : "Un deck"
        : "Tous mes decks";
  const filtersLabel = `${scopeLabel} · ${onlyDue ? "à revoir aujourd'hui" : "tout, échéances comprises"}`;

  const optionsPanel = (
    <div className="space-y-4 pt-2">
      <div>
        <div className="text-sm font-semibold">Source</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={scope === "all_decks" ? "default" : "outline"}
            onClick={() => updateFilters({ scope: "all_decks" })}
          >
            Tous mes decks
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "deck" ? "default" : "outline"}
            onClick={() => updateFilters({ scope: "deck" })}
          >
            Un deck
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "all_cards" ? "default" : "outline"}
            onClick={() => updateFilters({ scope: "all_cards" })}
          >
            Toutes les cartes
          </Button>
        </div>
      </div>

      {scope === "deck" ? (
        <div>
          <div className="text-sm font-semibold">Deck</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {loadingDecks ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : decks.length ? (
              decks.map((d) => (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={deckId === d.id ? "default" : "outline"}
                  onClick={() => updateFilters({ deckId: d.id })}
                >
                  {d.name}
                </Button>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">Aucun deck.</div>
            )}
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-sm font-semibold">Cartes</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={onlyDue ? "default" : "outline"}
            onClick={() => updateFilters({ onlyDue: true })}
          >
            À revoir (dues)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!onlyDue ? "default" : "outline"}
            onClick={() => updateFilters({ onlyDue: false })}
          >
            Tout (incl. à venir)
          </Button>
        </div>
      </div>
    </div>
  );

  const optionsToggle = (
    <button
      type="button"
      className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
      onClick={() => setOptionsOpen((v) => !v)}
      aria-expanded={optionsOpen}
      aria-controls="review-options"
    >
      <SlidersIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Options · {filtersLabel}</span>
      <ChevronDownIcon
        className={cn("size-4 shrink-0 transition-transform", optionsOpen ? "rotate-180" : "")}
      />
    </button>
  );

  // Écran de démarrage : le compteur d'abord, le bouton ensuite, les réglages
  // repliés — la promesse « révise 5 minutes » ne doit coûter qu'un clic.
  const startPanel = (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-end gap-3">
        <div className="text-4xl font-semibold leading-none tabular-nums">
          {loadingCounts && !counts ? "—" : queueCount}
        </div>
        <div className="pb-0.5 text-sm text-muted-foreground">
          {onlyDue ? "à revoir maintenant" : "carte(s) dans cette sélection"}
        </div>
      </div>

      {counts ? (
        <div className="mt-2 text-xs text-muted-foreground">
          {counts.due} due(s) · {counts.new} nouvelle(s) · {laterCount} plus tard
        </div>
      ) : null}

      <Button
        type="button"
        className="mt-4 h-11 w-full text-base"
        onClick={() => startSession()}
        disabled={busy}
      >
        Démarrer
      </Button>

      {onlyDue && counts && available === 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-sm text-muted-foreground">
            {totalCount === 0
              ? "Aucune carte dans cette sélection."
              : "Rien à revoir pour l'instant — reviens plus tard."}
          </div>
          {laterCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => startSession({ onlyDue: false })}
            >
              Réviser en avance ({pluralCards(laterCount)})
            </Button>
          ) : null}
          {totalCount === 0 ? (
            <Button asChild type="button" variant="outline" className="w-full">
              <Link href="/packs">Ajouter des cartes</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <Separator className="my-4" />

      {optionsToggle}
      {optionsOpen ? <div id="review-options">{optionsPanel}</div> : null}
    </div>
  );

  const sessionPanel = (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold">Session</div>
        <Badge variant="secondary">{sessionCount} revue(s)</Badge>
        {counts ? <Badge variant="outline">{remaining} restante(s)</Badge> : null}
        {replay.length ? (
          <Badge variant="outline">{replay.length} à rejouer</Badge>
        ) : null}
        <div className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={backToOptions}>
          Options
        </Button>
      </div>

      <Separator className="my-4" />

      {busy ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : !activeCard ? (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {sessionCount > 0
              ? "Session terminée : plus rien à revoir ici."
              : "Aucune carte disponible pour ce filtre."}
          </div>
          <Button type="button" variant="outline" onClick={backToOptions}>
            Changer les options
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground">Question</div>
            <div className="mt-1 text-lg font-semibold leading-snug">{activeCard.title}</div>
          </div>

          <div className={cn("rounded-xl border p-4", revealed ? "bg-muted/40" : "")}>
            {!revealed ? (
              <Button type="button" className="w-full" onClick={() => setRevealed(true)}>
                Révéler
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">Réponse</div>
                <RichText
                  html={activeCard.answer_express}
                  className="prose prose-zinc max-w-none dark:prose-invert"
                />

                {activeCard.key_points?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {activeCard.key_points.slice(0, 3).map((p) => (
                      <Badge key={p} variant="secondary" className="max-w-full truncate">
                        {p}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void onRate("know")} disabled={busy}>
                    Je sais
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onRate("medium")}
                    disabled={busy}
                  >
                    Moyen
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void onRate("again")}
                    disabled={busy}
                  >
                    À revoir
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={skipCard} disabled={busy}>
              Passer
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href={`/micro/${encodeURIComponent(activeCard.slug)}`}>Ouvrir</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <MobileScaffold title="À revoir">
      {loadingUser ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Chargement…</div>
      ) : !isLoggedIn ? (
        <LoginCta>Connecte-toi pour lancer une session de révision.</LoginCta>
      ) : (
        <div className="space-y-4">
          {started ? sessionPanel : startPanel}

          {error ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{error}</div>
          ) : null}
        </div>
      )}
    </MobileScaffold>
  );
}
