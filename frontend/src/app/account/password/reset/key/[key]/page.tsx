"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authResetPassword, ensureCsrf } from "@/lib/api";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function ResetPasswordFromKeyPage() {
  const router = useRouter();
  const params = useParams<{ key: string }>();

  const keyRaw = params?.key;
  const key = typeof keyRaw === "string" ? decodeURIComponent(keyRaw) : "";

  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!key) {
        setError("Clé manquante.");
        return;
      }
      if (!password) {
        setError("Nouveau mot de passe manquant.");
        return;
      }
      if (password !== password2) {
        setError("Les deux mots de passe ne correspondent pas.");
        return;
      }

      await ensureCsrf();
      await authResetPassword({ key, password });
      setDone(true);
      setPassword("");
      setPassword2("");
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileScaffold title="Réinitialiser le mot de passe">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="rounded-xl border bg-card p-4">
          {done ? (
            <div className="space-y-3">
              <div className="text-sm">Mot de passe mis à jour. Tu peux te connecter.</div>
              <Button className="w-full" onClick={() => router.push("/account/login")}
              >
                Aller à la connexion
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              {!key ? (
                <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
                  Clé manquante.
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-sm font-medium">Nouveau mot de passe</div>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Confirmer le mot de passe</div>
                <Input
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
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

              <Button type="submit" className="w-full" disabled={loading || !key}>
                {loading ? "Enregistrement…" : "Enregistrer"}
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
          )}
        </div>
      </div>
    </MobileScaffold>
  );
}
