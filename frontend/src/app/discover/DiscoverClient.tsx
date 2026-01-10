"use client";

import Link from "next/link";

import { FeedClient } from "@/components/FeedClient";
import { FilterSheet } from "@/components/FilterSheet";
import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { fetchDiscoverFeed } from "@/lib/api";

export default function DiscoverClient() {
  return (
    <MobileScaffold
      title="Dose du jour"
      headerRight={<FilterSheet basePath="/discover" />}
      contentClassName="space-y-4"
    >
      <div className="grid gap-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Reprendre</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Reprendre là où tu t’es arrêté.
          </div>
          <div className="mt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link href="/resume">Continuer</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">À revoir</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Les cartes dues pour ta révision.
          </div>
          <div className="mt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link href="/review">Démarrer une session</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Nouveautés</div>
        <FeedClient
          basePath="/discover"
          embedded
          showSearch={false}
          fetchPage={fetchDiscoverFeed}
        />
      </div>
    </MobileScaffold>
  );
}
