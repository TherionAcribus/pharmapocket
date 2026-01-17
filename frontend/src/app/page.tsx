"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { fetchLanding, fetchMe } from "@/lib/api";
import type { LandingPayload } from "@/lib/types";

function landingTargetToPath(target: string | null | undefined): string {
  if (target === "discover") return "/discover";
  if (target === "cards") return "/cards";
  if (target === "review") return "/review";
  if (target === "quiz") return "/quiz";
  return "/start";
}

export default function Home() {
  const router = useRouter();
  const [data, setData] = React.useState<LandingPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    fetchMe()
      .then((me) => {
        if (cancelled) return;
        if (me?.landing_redirect_enabled) {
          router.replace(landingTargetToPath(me.landing_redirect_target));
        }
      })
      .catch(() => {
        // ignore (not logged in)
      });

    fetchLanding()
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const showContent = !loading && data;
  const showFallback = !loading && !data;

  return (
    <MobileScaffold title="Accueil" contentClassName="space-y-4">
      {loading ? <div className="text-sm text-muted-foreground">Chargement…</div> : null}

      {showContent ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xl font-semibold leading-snug">
            {data.hero_title || "PharmaPocket"}
          </div>
          {data.hero_subtitle ? (
            <div className="mt-2 text-sm text-muted-foreground">{data.hero_subtitle}</div>
          ) : null}

          {data.hero_bullets?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.hero_bullets.slice(0, 6).map((b) => (
                <div key={b} className="rounded-full border bg-background px-3 py-1 text-xs">
                  {b}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild className="w-full">
              <Link href={landingTargetToPath(data.primary_cta_target)}>
                {data.primary_cta_label || "Commencer"}
              </Link>
            </Button>

            {data.secondary_cta_label && data.secondary_cta_target ? (
              <Button asChild variant="outline" className="w-full">
                <Link href={landingTargetToPath(data.secondary_cta_target)}>
                  {data.secondary_cta_label}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="w-full">
                <Link href="/discover">Dose du jour</Link>
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {showFallback ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Bienvenue</div>
          <div className="mt-1 text-sm text-muted-foreground">
            La landing page n’est pas encore configurée dans le CMS.
          </div>
          <div className="mt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link href="/start">Commencer</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {data?.steps?.length ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Comment ça marche ?</div>
          <div className="mt-3 grid gap-2">
            {data.steps.slice(0, 3).map((s) => (
              <div key={s.title} className="rounded-lg border bg-background px-3 py-3">
                <div className="text-sm font-medium">{s.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data?.cards?.length ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold">Découvrir</div>
          <div className="space-y-3">
            {data.cards.map((c, idx) => (
              <div key={`${c.title}-${idx}`} className="rounded-xl border bg-card p-4">
                <div className="text-base font-semibold">{c.title}</div>
                {c.summary ? (
                  <div className="mt-1 text-sm text-muted-foreground">{c.summary}</div>
                ) : null}
                <div className="mt-3">
                  <Button asChild variant="secondary" className="w-full">
                    <Link href={c.href?.startsWith("/") ? c.href : "/start"}>
                      {c.cta_label || "Ouvrir"}
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </MobileScaffold>
  );
}
