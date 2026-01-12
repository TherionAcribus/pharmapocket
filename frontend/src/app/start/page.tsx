"use client";

import Link from "next/link";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";

export default function StartPage() {
  return (
    <MobileScaffold title="Commencer" contentClassName="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold">1. Lis une carte</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Commence par une dose du jour ou un sujet de la bibliothèque.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild variant="secondary">
            <Link href="/discover">Dose du jour</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/library">Bibliothèque</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold">2. Sauvegarde dans tes decks</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Ajoute les cartes importantes à “Mes cartes” pour les retrouver.
        </div>
        <div className="mt-3">
          <Button asChild variant="secondary" className="w-full">
            <Link href="/cards">Voir mes cartes</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold">3. Révise 5 minutes</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Lance une session sur les cartes dues.
        </div>
        <div className="mt-3">
          <Button asChild variant="secondary" className="w-full">
            <Link href="/review">Démarrer une session</Link>
          </Button>
        </div>
      </div>

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
