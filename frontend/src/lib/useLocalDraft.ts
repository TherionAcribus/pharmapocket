"use client";

import * as React from "react";

/**
 * État persisté dans `localStorage`, pour les formulaires longs du back-office.
 *
 * La valeur initiale est celle du rendu serveur : le brouillon n'est relu
 * qu'après montage, ce qui évite toute divergence d'hydratation. Conséquence
 * assumée : un très bref affichage du formulaire vide au premier rendu.
 */
export function useLocalDraft<T>(key: string, initialValue: T) {
  const [value, setValue] = React.useState<T>(initialValue);
  const [restored, setRestored] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      // Brouillon illisible (format changé, quota, mode privé) : on repart du
      // formulaire vide plutôt que de casser la page.
    }
    setRestored(true);
  }, [key]);

  React.useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota dépassé : la saisie continue, seule la persistance est perdue.
    }
  }, [key, value, restored]);

  const clear = React.useCallback(() => {
    setValue(initialValue);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // idem
    }
    // `initialValue` est une constante de module côté appelants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear] as const;
}
