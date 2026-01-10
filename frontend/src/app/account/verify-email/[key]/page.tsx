"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { authVerifyEmail } from "@/lib/api";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useParams<{ key: string }>();

  const keyRaw = params?.key;
  const key = typeof keyRaw === "string" ? decodeURIComponent(keyRaw) : "";

  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      await authVerifyEmail(key);
      setDone(true);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!key) return;
    void onVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <MobileScaffold title="Vérification email">
      <div className="mx-auto w-full max-w-md space-y-3">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          {!key ? <div className="text-sm text-destructive">Clé manquante.</div> : null}

          {error ? (
            <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {done ? (
            <div className="text-sm">
              Adresse email vérifiée. Tu peux maintenant te connecter.
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {loading ? "Vérification…" : "Vérification en cours."}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/account/login")}
              disabled={loading}
            >
              Aller à la connexion
            </Button>
            {!done ? (
              <Button type="button" onClick={onVerify} disabled={loading || !key}>
                Réessayer
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </MobileScaffold>
  );
}
