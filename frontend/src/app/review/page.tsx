"use client";

import * as React from "react";
import Link from "next/link";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useDecks, useMe, useRateSrsCard, useSrsNext } from "@/lib/queries";
import type { SrsNextQuery, SrsScope } from "@/lib/api";
import type { SrsRating } from "@/lib/types";

function RichText({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ReviewPage() {
  const { data: me, isPending: loadingUser } = useMe();
  const isLoggedIn = Boolean(me);

  const { data: decks = [], isPending: loadingDecks } = useDecks(isLoggedIn);

  const [scope, setScope] = React.useState<SrsScope>("all_decks");
  const [selectedDeckId, setSelectedDeckId] = React.useState<number | null>(null);
  const [onlyDue, setOnlyDue] = React.useState(true);

  React.useEffect(() => {
    if (!decks.length) {
      setSelectedDeckId(null);
      return;
    }
    setSelectedDeckId((prev) => {
      if (prev != null && decks.some((d) => d.id === prev)) return prev;
      const fallback = decks.find((d) => d.is_default) ?? decks[0];
      return fallback ? fallback.id : null;
    });
  }, [decks]);

  const [revealed, setRevealed] = React.useState(false);
  const [sessionCount, setSessionCount] = React.useState(0);
  const [started, setStarted] = React.useState(false);
  const [scopeError, setScopeError] = React.useState<string | null>(null);

  const srsQuery = React.useMemo<SrsNextQuery>(
    () => ({
      scope,
      deck_id: scope === "deck" ? selectedDeckId : undefined,
      only_due: onlyDue,
    }),
    [onlyDue, scope, selectedDeckId]
  );

  // La session ne démarre jamais toute seule : `started` n'est vrai qu'après un
  // clic sur « Démarrer », et retombe dès qu'un filtre change.
  const {
    data: current,
    isFetching: loadingCard,
    error: queryError,
    refetch,
  } = useSrsNext(srsQuery, isLoggedIn && started);

  const rateMutation = useRateSrsCard(srsQuery);

  React.useEffect(() => {
    setStarted(false);
    setRevealed(false);
    setSessionCount(0);
    setScopeError(null);
  }, [scope, selectedDeckId, onlyDue]);

  const requestError = queryError ?? rateMutation.error;
  const error = scopeError ?? requestError?.message ?? null;

  const loadNext = () => {
    if (!isLoggedIn) return;
    if (scope === "deck" && !selectedDeckId) {
      setScopeError("Choisis un deck.");
      return;
    }
    setScopeError(null);
    setRevealed(false);
    if (!started) setStarted(true);
    else void refetch();
  };

  const onRate = async (rating: SrsRating) => {
    if (!current?.card || loadingCard || rateMutation.isPending) return;
    try {
      await rateMutation.mutateAsync({ card_id: current.card.id, rating });
      setSessionCount((v) => v + 1);
      setRevealed(false);
    } catch {
      // `rateMutation.error` alimente déjà le bandeau d'erreur.
    }
  };

  const busy = loadingCard || rateMutation.isPending;

  return (
    <MobileScaffold title="À revoir">
      {loadingUser ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Chargement…</div>
      ) : !isLoggedIn ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Connecte-toi pour lancer une session de révision.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Source</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={scope === "deck" ? "default" : "outline"}
                onClick={() => setScope("deck")}
              >
                Un deck
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "all_decks" ? "default" : "outline"}
                onClick={() => setScope("all_decks")}
              >
                Tous mes decks
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "all_cards" ? "default" : "outline"}
                onClick={() => setScope("all_cards")}
              >
                Toutes les cartes
              </Button>
            </div>

            {scope === "deck" ? (
              <>
                <Separator className="my-4" />
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
                        variant={selectedDeckId === d.id ? "default" : "outline"}
                        onClick={() => setSelectedDeckId(d.id)}
                      >
                        {d.name}
                      </Button>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">Aucun deck.</div>
                  )}
                </div>
              </>
            ) : null}

            <Separator className="my-4" />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={onlyDue ? "default" : "outline"}
                onClick={() => setOnlyDue(true)}
              >
                À revoir (dues)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!onlyDue ? "default" : "outline"}
                onClick={() => setOnlyDue(false)}
              >
                Tout (incl. à venir)
              </Button>

              <div className="flex-1" />

              <Button type="button" size="sm" onClick={loadNext} disabled={busy}>
                Démarrer
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{error}</div>
          ) : null}

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">Session</div>
              <Badge variant="secondary">{sessionCount} revue(s)</Badge>
            </div>

            <Separator className="my-4" />

            {busy ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : !current?.card ? (
              <div className="text-sm text-muted-foreground">
                {started && current
                  ? "Aucune carte disponible pour ce filtre."
                  : "Lance une session pour commencer."}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">Question</div>
                  <div className="mt-1 text-lg font-semibold leading-snug">{current.card.title}</div>
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
                        html={current.card.answer_express}
                        className="prose prose-zinc max-w-none dark:prose-invert"
                      />

                      {current.card.key_points?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {current.card.key_points.slice(0, 3).map((p) => (
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
                  <Button type="button" variant="outline" onClick={loadNext} disabled={busy}>
                    Passer
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <Link href={`/micro/${encodeURIComponent(current.card.slug)}`}>Ouvrir</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </MobileScaffold>
  );
}
