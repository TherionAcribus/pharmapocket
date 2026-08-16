"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { LOGIN_PATH, sanitizeNextPath } from "@/lib/authRedirect";
import { useMe } from "@/lib/queries";

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

  const next = sanitizeNextPath(sp.get("next"));

  const { data: me, isPending: loading, error: meError } = useMe();

  React.useEffect(() => {
    if (!me) return;
    if (next) {
      router.replace(next);
      return;
    }
    const shouldRedirect = Boolean(me.landing_redirect_enabled);
    router.replace(shouldRedirect ? landingTargetToPath(me.landing_redirect_target) : "/discover");
  }, [me, next, router]);

  // `me === null` : le retour du fournisseur n'a pas ouvert de session.
  const error = meError
    ? meError.message
    : !loading && !me
      ? "La connexion n’a pas abouti."
      : null;

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
              <Button type="button" onClick={() => router.replace(LOGIN_PATH)}>
                Retour à la connexion
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </MobileScaffold>
  );
}
