"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authLogin, ensureCsrf, fetchMe } from "@/lib/api";

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

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function landingTargetToPath(target: string | null | undefined): string {
  if (target === "discover") return "/discover";
  if (target === "cards") return "/cards";
  if (target === "review") return "/review";
  if (target === "quiz") return "/quiz";
  return "/start";
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void ensureCsrf();
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        const shouldRedirect = Boolean(me.landing_redirect_enabled);
        const target = shouldRedirect ? landingTargetToPath(me.landing_redirect_target) : "/discover";
        router.replace(target);
      })
      .catch(() => {
        // ignore: not logged in
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await ensureCsrf();
      await authLogin({ email: email.trim(), password });
      const me = await fetchMe();
      const shouldRedirect = Boolean(me.landing_redirect_enabled);
      const target = shouldRedirect ? landingTargetToPath(me.landing_redirect_target) : "/discover";
      router.push(target);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
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
            startProviderRedirect(
              "google",
              "login",
              `${window.location.origin}/account/oauth-callback?next=${encodeURIComponent(
                "/discover"
              )}`
            );
          }}
        >
          Continuer avec Google
        </Button>

        <div className="rounded-xl border bg-card p-4">
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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
        </div>

        <div className="text-xs text-muted-foreground">
          En cas de problème, vérifie que le backend tourne et que les cookies sont autorisés.
        </div>
      </div>
    </MobileScaffold>
  );
}
