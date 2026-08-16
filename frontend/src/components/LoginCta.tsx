"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useLoginHref, useSignupHref } from "@/lib/authRedirect";
import { cn } from "@/lib/utils";

type LoginCtaProps = {
  /** Ce que l'utilisateur gagne à se connecter, formulé pour l'écran courant. */
  children: React.ReactNode;
  /** Sans habillage de carte, pour les blocs déjà posés dans une carte. */
  compact?: boolean;
  className?: string;
};

/**
 * État « il faut un compte », avec le bouton pour en sortir.
 *
 * Le message seul obligeait à deviner que la connexion se trouve dans le menu :
 * les liens sont ici, et ramènent sur la page où l'utilisateur a été bloqué.
 */
export function LoginCta({ children, compact = false, className }: LoginCtaProps) {
  const login = useLoginHref();
  const signup = useSignupHref();

  return (
    <div
      className={cn(
        compact ? "space-y-2" : "space-y-3 rounded-xl border bg-card p-4",
        className
      )}
    >
      <div className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
        {children}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={login}>Se connecter</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={signup}>Créer un compte</Link>
        </Button>
      </div>
    </div>
  );
}
