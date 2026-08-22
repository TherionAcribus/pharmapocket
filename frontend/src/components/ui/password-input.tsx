"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Champ mot de passe avec bascule « afficher / masquer ».
 *
 * Sur mobile, où la saisie est la plus fautive, pouvoir relire ce qu'on tape
 * évite un aller-retour complet vers un message « identifiants incorrects ».
 * Le `type` est piloté ici et n'est donc pas exposé : un appelant qui veut un
 * autre type prend `Input` directement.
 */
function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);
  const label = visible ? "Masquer le mot de passe" : "Afficher le mot de passe";

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        // `::-ms-reveal` : Edge ajoute son propre œil dans le champ, qui
        // doublonnerait avec le nôtre et ne suivrait pas son état.
        className={cn("pr-10 [&::-ms-reveal]:hidden", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export { PasswordInput };
