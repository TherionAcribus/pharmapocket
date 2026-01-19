"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authRequestPasswordReset, ensureCsrf } from "@/lib/api";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDone(false);

    try {
      await ensureCsrf();
      await authRequestPasswordReset(email);
      setDone(true);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileScaffold title="Mot de passe oublié">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm text-muted-foreground">
            Saisis ton email. Si un compte existe, tu recevras un lien de réinitialisation.
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Email</div>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>

            {error ? (
              <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {done ? (
              <div className="rounded-md border bg-emerald-500/5 p-2 text-sm">
                Demande envoyée. Vérifie ta boîte mail.
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Envoi…" : "Envoyer"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/account/login")}
              disabled={loading}
            >
              Retour à la connexion
            </Button>
          </form>
        </div>
      </div>
    </MobileScaffold>
  );
}
