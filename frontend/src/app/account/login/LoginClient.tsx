"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

import { authLogin, ensureCsrf, fetchMe } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/client";
import { BAD_CREDENTIALS_MESSAGE, authErrorMessage } from "@/lib/authErrors";
import { sanitizeNextPath, signupHref } from "@/lib/authRedirect";
import { queryKeys, resetSessionCache, useMe } from "@/lib/queries";

function getBackendBaseUrlClient(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const fallback = "http://localhost:8000";
  const raw = (base && base.trim()) || fallback;
  return raw.replace(/\/$/, "");
}

function startProviderRedirect(provider: string, process: "login" | "connect", callbackUrl: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${getBackendBaseUrlClient()}/auth/browser/v1/auth/provider/redirect`;

  const csrf = (() => {
    const parts = document.cookie.split(";");
    for (const part of parts) {
      const [k, ...rest] = part.trim().split("=");
      if (k === "csrftoken") return decodeURIComponent(rest.join("="));
    }
    return null;
  })();

  const add = (name: string, value: string) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  if (csrf) add("csrfmiddlewaretoken", csrf);

  add("provider", provider);
  add("process", process);
  add("callback_url", callbackUrl);

  document.body.appendChild(form);
  form.submit();
}

function parseAllauthAuthenticationResponseFromError(e: unknown):
  | { flows: Array<{ id: string; is_pending?: boolean }> }
  | null {
  // allauth répond 401 avec les « flows » restants (dont la vérification email)
  // dans le corps JSON de la réponse.
  if (!isApiError(e) || e.status !== 401) return null;

  const body = e.body as { data?: { flows?: Array<{ id: string; is_pending?: boolean }> } } | null;
  const flows = body?.data?.flows;
  if (!Array.isArray(flows)) return null;
  return { flows };
}

/** Le login a abouti côté identifiants, mais l'email reste à confirmer. */
function isEmailVerificationPending(e: unknown): boolean {
  const auth = parseAllauthAuthenticationResponseFromError(e);
  return Boolean(auth?.flows?.some((f) => f?.id === "verify_email" && Boolean(f?.is_pending)));
}

// Le renvoi de l'email de confirmation passe par une nouvelle tentative de
// login : avec `ACCOUNT_EMAIL_VERIFICATION = "mandatory"`, allauth renvoie le
// message depuis `EmailVerificationStage`. Le backend n'en envoie qu'un par
// tranche de `ACCOUNT_RATE_LIMITS["confirm_email"]` (1/180s/key) : on désarme
// le bouton d'autant pour ne pas promettre un email que personne n'enverra.
const RESEND_COOLDOWN_SECONDS = 180;

function landingTargetToPath(target: string | null | undefined): string {
  if (target === "discover") return "/discover";
  if (target === "cards") return "/cards";
  if (target === "review") return "/review";
  if (target === "quiz") return "/quiz";
  return "/start";
}

export default function LoginClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: me } = useMe();

  // La page d'où l'utilisateur a été renvoyé ici. Elle prime sur la préférence
  // d'atterrissage : il attend de retrouver l'écran qu'il essayait d'utiliser.
  const next = sanitizeNextPath(searchParams.get("next"));

  const destinationFor = React.useCallback(
    (user: { landing_redirect_enabled?: boolean | null; landing_redirect_target?: string | null }) => {
      if (next) return next;
      return user.landing_redirect_enabled
        ? landingTargetToPath(user.landing_redirect_target)
        : "/discover";
    },
    [next]
  );

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [emailVerificationPending, setEmailVerificationPending] = React.useState(false);
  const [resendDone, setResendDone] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);

  React.useEffect(() => {
    void ensureCsrf();
  }, []);

  // Décompte du réarmement du bouton de renvoi.
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  // Déjà connecté : cette page n'a rien à proposer.
  React.useEffect(() => {
    if (!me) return;
    router.replace(destinationFor(me));
  }, [me, destinationFor, router]);

  // Session ouverte : tout ce qui a été mis en cache l'a été en tant qu'anonyme.
  const enterSession = React.useCallback(async () => {
    await resetSessionCache(queryClient);
    const loggedIn = await fetchMe();
    queryClient.setQueryData(queryKeys.me, loggedIn);
    router.push(destinationFor(loggedIn));
  }, [destinationFor, queryClient, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEmailVerificationPending(false);
    setResendDone(false);
    try {
      await ensureCsrf();
      await authLogin({ identifier, password });
      await enterSession();
    } catch (err: unknown) {
      if (isEmailVerificationPending(err)) {
        // Atteindre cet état a déjà déclenché l'envoi d'un email : le bouton de
        // renvoi part donc en cooldown, il n'y a rien à renvoyer avant.
        setEmailVerificationPending(true);
        setResendDone(true);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setError(null);
      } else {
        setError(authErrorMessage(err, BAD_CREDENTIALS_MESSAGE));
      }
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setLoading(true);
    setError(null);
    setResendDone(false);
    try {
      await ensureCsrf();
      await authLogin({ identifier, password });
      // Vérifiée entre-temps (autre onglet, lien cliqué) : le login passe.
      await enterSession();
    } catch (err: unknown) {
      if (isEmailVerificationPending(err)) {
        setResendDone(true);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setError(authErrorMessage(err, BAD_CREDENTIALS_MESSAGE));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileScaffold title="Connexion">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            await ensureCsrf();
            // Sans `next`, on laisse le callback appliquer la préférence
            // d'atterrissage du compte, comme la connexion par mot de passe.
            const callback = new URL("/account/oauth-callback", window.location.origin);
            if (next) callback.searchParams.set("next", next);
            startProviderRedirect("google", "login", callback.toString());
          }}
        >
          Continuer avec Google
        </Button>

        <div className="rounded-xl border bg-card p-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Email ou pseudo</div>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
                autoComplete="current-password"
                required
              />
            </div>

            {error ? (
              <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {emailVerificationPending ? (
              <div className="rounded-md border bg-amber-500/10 p-2 text-sm">
                <div className="font-medium">Adresse email à vérifier</div>
                <div className="text-muted-foreground">
                  Ton compte nécessite une confirmation par email avant de pouvoir te connecter.
                </div>
                <div className="pt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onResend}
                    disabled={loading || resendCooldown > 0}
                  >
                    {resendCooldown > 0
                      ? `Renvoyer l’email (${resendCooldown} s)`
                      : "Renvoyer l’email"}
                  </Button>
                </div>
                {resendDone ? (
                  <div className="pt-2 text-muted-foreground">
                    Email envoyé. Pense à vérifier tes spams.
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>

            <button
              type="button"
              className="w-full text-left text-xs text-muted-foreground underline"
              onClick={() => router.push("/account/password/forgot")}
              disabled={loading}
            >
              Mot de passe oublié ?
            </button>
          </form>
        </div>

        <div className="text-xs text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href={signupHref(next)} className="underline">
            Créer un compte
          </Link>
        </div>

        <div className="text-xs text-muted-foreground">
          En cas de problème, vérifie que le backend tourne et que les cookies sont autorisés.
        </div>
      </div>
    </MobileScaffold>
  );
}
