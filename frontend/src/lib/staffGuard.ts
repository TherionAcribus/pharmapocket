"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useMe } from "@/lib/queries";

/**
 * Garde des pages `/admin` : renvoie l'anonyme vers la connexion et
 * l'utilisateur non-staff vers l'app publique.
 *
 * `isStaff` sert aussi de `enabled` aux requêtes admin, pour ne pas déclencher
 * d'appel qui finirait en 403 pendant la redirection.
 */
export function useStaffGuard(): { checking: boolean; isStaff: boolean } {
  const router = useRouter();
  const { data: me, isPending } = useMe();

  React.useEffect(() => {
    if (isPending) return;
    if (!me) {
      router.replace("/account/login");
      return;
    }
    if (!me.is_staff) router.replace("/discover");
  }, [isPending, me, router]);

  return { checking: isPending, isStaff: Boolean(me?.is_staff) };
}
