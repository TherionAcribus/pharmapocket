"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authSignup, authStartProviderRedirect, ensureCsrf } from "@/lib/api/auth";
import { loginHref, sanitizeNextPath } from "@/lib/authRedirect";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // L'inscription passe par la vérification email : `next` ne sert pas ici, il
  // est relayé au lien de connexion pour survivre à l'aller-retour.
  const next = sanitizeNextPath(searchParams.get("next"));

  const [email, setEmail] = React.useState("");
  const [pseudo, setPseudo] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authSignup({ email: email.trim(), username: pseudo.trim(), password });
      setDone(true);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileScaffold title="Inscription">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            await ensureCsrf();
            // Google ouvre la session directement : on revient sur la page
            // d'origine, ou sur la préférence d'atterrissage à défaut.
            const callback = new URL("/account/oauth-callback", window.location.origin);
            if (next) callback.searchParams.set("next", next);
            authStartProviderRedirect({
              provider: "google",
              flow: "login",
              callbackUrl: callback.toString(),
            });
          }}
        >
          Continuer avec Google
        </Button>

        <div className="rounded-xl border bg-card p-4">
          {done ? (
            <div className="space-y-3">
              <div className="text-sm">
                Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.
              </div>
              <Button onClick={() => router.push(loginHref(next))}>
                Aller à la connexion
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
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

              <div className="space-y-1">
                <div className="text-sm font-medium">Pseudo</div>
                <Input
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  type="text"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Mot de passe</div>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Création…" : "Créer mon compte"}
              </Button>
            </form>
          )}
        </div>

        {done ? null : (
          <div className="text-xs text-muted-foreground">
            Déjà un compte ?{" "}
            <Link href={loginHref(next)} className="underline">
              Se connecter
            </Link>
          </div>
        )}
      </div>
    </MobileScaffold>
  );
}
