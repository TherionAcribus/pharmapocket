"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { fetchMe } from "@/lib/api";

function toNextPath(next: string | null): string {
  if (!next) return "";
  if (!next.startsWith("/")) return "/discover";
  return next;
}

function landingTargetToPath(target: string | null | undefined): string {
  if (target === "discover") return "/discover";
  if (target === "cards") return "/cards";
  if (target === "review") return "/review";
  if (target === "quiz") return "/quiz";
  return "/start";
}

export default function OAuthCallbackClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = toNextPath(sp.get("next"));

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    fetchMe()
      .then((me) => {
        if (cancelled) return;
        if (next) {
          router.replace(next);
          return;
        }
        const shouldRedirect = Boolean(me.landing_redirect_enabled);
        const target = shouldRedirect ? landingTargetToPath(me.landing_redirect_target) : "/discover";
        router.replace(target);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return (
    <MobileScaffold title="Connexion…">
      <div className="mx-auto w-full max-w-md space-y-3">
        <div className="rounded-xl border bg-card p-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Finalisation de la connexion…</div>
          ) : null}

          {error ? (
            <div className="space-y-3">
              <div className="text-sm text-destructive">{error}</div>
              <Button type="button" onClick={() => router.replace("/account/login")}
              >
                Retour à la connexion
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </MobileScaffold>
  );
}
