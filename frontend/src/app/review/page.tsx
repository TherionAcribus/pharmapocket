"use client";

import * as React from "react";
import Link from "next/link";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { fetchDecks, fetchMe, fetchSrsNext, postSrsReview } from "@/lib/api";
import type { DeckSummary, SrsNextResponse, SrsRating, SrsScope } from "@/lib/types";

function RichText({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ReviewPage() {
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(false);
  const [loadingUser, setLoadingUser] = React.useState(true);

  const [decks, setDecks] = React.useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = React.useState(false);

  const [scope, setScope] = React.useState<SrsScope>("all_decks");
  const [selectedDeckId, setSelectedDeckId] = React.useState<number | null>(null);
  const [onlyDue, setOnlyDue] = React.useState(true);

  const [revealed, setRevealed] = React.useState(false);
  const [current, setCurrent] = React.useState<SrsNextResponse | null>(null);
  const [loadingCard, setLoadingCard] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionCount, setSessionCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingUser(true);
    fetchMe()
      .then(() => {
        if (cancelled) return;
        setIsLoggedIn(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoggedIn(false);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingUser(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setLoadingDecks(true);
    fetchDecks()
      .then((rows) => {
        if (cancelled) return;
        setDecks(rows);
        const defaultDeck = rows.find((d) => d.is_default) ?? rows[0] ?? null;
        setSelectedDeckId(defaultDeck ? defaultDeck.id : null);
      })
      .catch(() => {
        if (cancelled) return;
        setDecks([]);
        setSelectedDeckId(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingDecks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const loadNext = React.useCallback(async () => {
    if (!isLoggedIn) return;

    if (scope === "deck" && !selectedDeckId) {
      setError("Choisis un deck.");
      return;
    }

    setError(null);
    setLoadingCard(true);
    setRevealed(false);
    try {
      const res = await fetchSrsNext({
        scope,
        deck_id: scope === "deck" ? selectedDeckId : undefined,
        only_due: onlyDue,
      });
      setCurrent(res);
    } catch (e) {
      setCurrent(null);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingCard(false);
    }
  }, [isLoggedIn, onlyDue, scope, selectedDeckId]);

  React.useEffect(() => {
    setCurrent(null);
    setRevealed(false);
    setSessionCount(0);
    setError(null);
  }, [scope, selectedDeckId, onlyDue]);

  const onRate = async (rating: SrsRating) => {
    if (!current?.card) return;
    if (loadingCard) return;

    setLoadingCard(true);
    setError(null);
    try {
      await postSrsReview({ card_id: current.card.id, rating });
      setSessionCount((v) => v + 1);
      const res = await fetchSrsNext({
        scope,
        deck_id: scope === "deck" ? selectedDeckId : undefined,
        only_due: onlyDue,
      });
      setCurrent(res);
      setRevealed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingCard(false);
    }
  };

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

              <Button type="button" size="sm" onClick={() => void loadNext()} disabled={loadingCard}>
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

            {loadingCard ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : !current?.card ? (
              <div className="text-sm text-muted-foreground">
                {current ? "Aucune carte disponible pour ce filtre." : "Lance une session pour commencer."}
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
                        <Button type="button" onClick={() => void onRate("know")} disabled={loadingCard}>
                          Je sais
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void onRate("medium")}
                          disabled={loadingCard}
                        >
                          Moyen
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => void onRate("again")}
                          disabled={loadingCard}
                        >
                          À revoir
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void loadNext()} disabled={loadingCard}>
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
