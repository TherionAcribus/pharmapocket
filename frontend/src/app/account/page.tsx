"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

import {
  accountChangeEmail,
  accountChangePassword,
  authLogout,
  ensureCsrf,
} from "@/lib/api/auth";
import {
  resetSessionCache,
  useAccount,
  useDeleteAccount,
  usePatchAccount,
} from "@/lib/queries";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function AccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: account, isPending: loading, error: accountError } = useAccount();
  const loadError = accountError ? toErrorMessage(accountError) : null;

  const patchAccountMutation = usePatchAccount();
  const deleteAccountMutation = useDeleteAccount();

  const [pseudo, setPseudo] = React.useState("");
  const [pseudoError, setPseudoError] = React.useState<string | null>(null);
  const pseudoSaving = patchAccountMutation.isPending;

  const [newEmail, setNewEmail] = React.useState("");
  const [emailSaving, setEmailSaving] = React.useState(false);
  const [emailDone, setEmailDone] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newPassword2, setNewPassword2] = React.useState("");
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordDone, setPasswordDone] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const deleting = deleteAccountMutation.isPending;

  // Les champs éditables sont initialisés une fois, à l'arrivée des données :
  // ensuite ils appartiennent à l'utilisateur qui est en train de taper.
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!account || hydratedRef.current) return;
    hydratedRef.current = true;
    setPseudo(account.pseudo ?? "");
    setNewEmail(account.email ?? "");
  }, [account]);

  const savePseudo = async () => {
    if (!account || pseudoSaving) return;
    setPseudoError(null);
    try {
      const res = await patchAccountMutation.mutateAsync({ pseudo });
      setPseudo(res.pseudo ?? "");
    } catch (e: unknown) {
      setPseudoError(toErrorMessage(e));
    }
  };

  const requestEmailChange = async () => {
    if (!account || emailSaving) return;
    setEmailSaving(true);
    setEmailDone(false);
    setEmailError(null);
    try {
      await ensureCsrf();
      await accountChangeEmail(newEmail);
      setEmailDone(true);
    } catch (e: unknown) {
      setEmailError(toErrorMessage(e));
    } finally {
      setEmailSaving(false);
    }
  };

  const changePassword = async () => {
    if (!account || passwordSaving) return;
    setPasswordSaving(true);
    setPasswordDone(false);
    setPasswordError(null);
    try {
      if (!newPassword) {
        setPasswordError("Nouveau mot de passe manquant.");
        return;
      }
      if (newPassword !== newPassword2) {
        setPasswordError("Les deux mots de passe ne correspondent pas.");
        return;
      }
      await ensureCsrf();
      await accountChangePassword({
        new_password: newPassword,
        current_password: account.has_usable_password ? currentPassword : undefined,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setPasswordDone(true);
    } catch (e: unknown) {
      setPasswordError(toErrorMessage(e));
    } finally {
      setPasswordSaving(false);
    }
  };

  const confirmAndDeleteAccount = async () => {
    if (!account || deleting) return;
    setDeleteError(null);

    const ok = window.confirm(
      "Supprimer définitivement ton compte ? Cette action est irréversible."
    );
    if (!ok) return;

    try {
      await deleteAccountMutation.mutateAsync({ password: deletePassword });
      await ensureCsrf();
      await authLogout().catch(() => {});
      await resetSessionCache(queryClient);
      router.push("/discover");
    } catch (e: unknown) {
      setDeleteError(toErrorMessage(e));
    }
  };

  if (loading) {
    return (
      <MobileScaffold title="Compte">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </MobileScaffold>
    );
  }

  if (!account) {
    return (
      <MobileScaffold title="Compte">
        <div className="mx-auto w-full max-w-md space-y-3">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="text-sm font-medium">Connexion requise</div>
            <div className="text-sm text-muted-foreground">
              Tu dois être connecté pour gérer ton compte.
            </div>
            {loadError ? (
              <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => router.push("/account/login")}>Connexion</Button>
              <Button variant="outline" onClick={() => router.push("/account/signup")}
              >
                Inscription
              </Button>
            </div>
          </div>
        </div>
      </MobileScaffold>
    );
  }

  return (
    <MobileScaffold title="Compte">
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-medium">Profil</div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Pseudo</div>
            <Input value={pseudo} onChange={(e) => setPseudo(e.target.value)} />
          </div>

          {pseudoError ? (
            <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
              {pseudoError}
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" onClick={savePseudo} disabled={pseudoSaving}>
              {pseudoSaving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-medium">Email</div>
          <div className="text-sm text-muted-foreground">
            Un email de confirmation sera envoyé à la nouvelle adresse.
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Nouvel email</div>
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />
          </div>

          {emailDone ? (
            <div className="rounded-md border bg-emerald-500/5 p-2 text-sm">
              Demande envoyée. Vérifie ta boîte mail.
            </div>
          ) : null}

          {emailError ? (
            <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
              {emailError}
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" onClick={requestEmailChange} disabled={emailSaving}>
              {emailSaving ? "Envoi…" : "Changer mon email"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-medium">Mot de passe</div>

          {account.has_usable_password ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Mot de passe actuel</div>
              <Input
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Ton compte n’a pas de mot de passe (connexion via un fournisseur). Tu peux en définir un.
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Nouveau mot de passe</div>
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Confirmer le mot de passe</div>
            <Input
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </div>

          {passwordDone ? (
            <div className="rounded-md border bg-emerald-500/5 p-2 text-sm">
              Mot de passe mis à jour.
            </div>
          ) : null}

          {passwordError ? (
            <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
              {passwordError}
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" onClick={changePassword} disabled={passwordSaving}>
              {passwordSaving ? "Enregistrement…" : "Changer mon mot de passe"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-medium text-destructive">Suppression du compte</div>
          <div className="text-sm text-muted-foreground">
            Suppression définitive de ton compte et de tes données associées.
          </div>

          {account.has_usable_password ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Mot de passe</div>
              <Input
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>
          ) : null}

          {deleteError ? (
            <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
              {deleteError}
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="destructive"
              onClick={confirmAndDeleteAccount}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer mon compte"}
            </Button>
          </div>
        </div>
      </div>
    </MobileScaffold>
  );
}
