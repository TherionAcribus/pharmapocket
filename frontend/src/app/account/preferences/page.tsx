"use client";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  applyAccentColorToDocument,
  clearStoredAccentColor,
  getStoredAccentColor,
  normalizeHexColor,
  setStoredAccentColor,
} from "@/lib/accentColor";
import { fetchMe, fetchPreferences, patchPreferences, type LandingRedirectTarget } from "@/lib/api";
import * as React from "react";

const SLIDE_TRANSITION_STORAGE_KEY = "pp_reader_slide_transition";

function readSlideTransitionPreferenceFromStorage() {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(SLIDE_TRANSITION_STORAGE_KEY);
    if (v == null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

function writeSlideTransitionPreferenceToStorage(next: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SLIDE_TRANSITION_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
}

export default function PreferencesPage() {
  const [hex, setHex] = React.useState(() => getStoredAccentColor() ?? "");
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [slideTransitionEnabled, setSlideTransitionEnabled] = React.useState<boolean>(() =>
    readSlideTransitionPreferenceFromStorage()
  );
  const [landingRedirectEnabled, setLandingRedirectEnabled] = React.useState(false);
  const [landingRedirectTarget, setLandingRedirectTarget] = React.useState<LandingRedirectTarget>(
    "start"
  );
  const [landingRedirectLoading, setLandingRedirectLoading] = React.useState(false);
  const [landingRedirectSaving, setLandingRedirectSaving] = React.useState(false);

  const onSetHex = (next: string) => {
    setHex(next);
    const normalized = normalizeHexColor(next);
    if (!normalized) return;
    setStoredAccentColor(normalized);
    applyAccentColorToDocument(normalized);
  };

  const onReset = () => {
    setHex("");
    clearStoredAccentColor();
    applyAccentColorToDocument(null);
  };

  React.useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then(() => {
        if (cancelled) return;
        setIsLoggedIn(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setLandingRedirectLoading(true);
    fetchPreferences()
      .then((p) => {
        if (cancelled) return;
        setLandingRedirectEnabled(Boolean(p.landing_redirect_enabled));
        setLandingRedirectTarget(p.landing_redirect_target);
      })
      .catch(() => {
        if (cancelled) return;
        // ignore: keep defaults
      })
      .finally(() => {
        if (cancelled) return;
        setLandingRedirectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SLIDE_TRANSITION_STORAGE_KEY) return;
      setSlideTransitionEnabled(readSlideTransitionPreferenceFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onSetSlideTransitionEnabled = (next: boolean) => {
    setSlideTransitionEnabled(next);
    writeSlideTransitionPreferenceToStorage(next);
  };

  const saveLandingRedirect = async (input: Partial<{ enabled: boolean; target: LandingRedirectTarget }>) => {
    if (!isLoggedIn) return;
    if (landingRedirectSaving) return;
    setLandingRedirectSaving(true);
    try {
      const res = await patchPreferences({
        landing_redirect_enabled:
          typeof input.enabled === "boolean" ? input.enabled : landingRedirectEnabled,
        landing_redirect_target: input.target ?? landingRedirectTarget,
      });
      setLandingRedirectEnabled(Boolean(res.landing_redirect_enabled));
      setLandingRedirectTarget(res.landing_redirect_target);
    } finally {
      setLandingRedirectSaving(false);
    }
  };

  return (
    <MobileScaffold title="Préférences">
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-medium">Couleur d’accent</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Appliquée aux boutons et éléments d’interface (pas aux textes).
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              aria-label="Sélecteur de couleur"
              type="color"
              value={normalizeHexColor(hex) ?? "#000000"}
              onChange={(e) => onSetHex(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1"
            />

            <div className="flex-1">
              <Input
                value={hex}
                onChange={(e) => onSetHex(e.target.value)}
                placeholder="#000000"
                inputMode="text"
              />
              <div className="mt-1 text-xs text-muted-foreground">
                Format: #RRGGBB
              </div>
            </div>

            <Button type="button" variant="outline" onClick={onReset}>
              Réinitialiser
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-medium">Aperçu</div>
          <div className="mt-3 flex gap-2">
            <Button type="button">Bouton</Button>
            <Button type="button" variant="outline">
              Outline
            </Button>
          </div>
        </div>

        {isLoggedIn ? (
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-medium">Lecture</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Animation lors du passage à la carte suivante / précédente.
            </div>

            <button
              type="button"
              className="mt-4 flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-3 text-left"
              onClick={() => onSetSlideTransitionEnabled(!slideTransitionEnabled)}
            >
              <Checkbox
                checked={slideTransitionEnabled}
                onCheckedChange={(v) => onSetSlideTransitionEnabled(Boolean(v))}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Transition “glisser” entre les cartes</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Activée par défaut</div>
              </div>
            </button>
          </div>
        ) : null}

        {isLoggedIn ? (
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-medium">Accueil</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Redirection automatique après la landing page.
            </div>

            <button
              type="button"
              className="mt-4 flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-3 text-left"
              onClick={() => {
                const next = !landingRedirectEnabled;
                setLandingRedirectEnabled(next);
                void saveLandingRedirect({ enabled: next });
              }}
              aria-disabled={landingRedirectLoading || landingRedirectSaving}
            >
              <Checkbox
                checked={landingRedirectEnabled}
                onCheckedChange={(v) => {
                  const next = Boolean(v);
                  setLandingRedirectEnabled(next);
                  void saveLandingRedirect({ enabled: next });
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Activer la redirection</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {landingRedirectLoading ? "Chargement…" : "Choisis ta page d’arrivée"}
                </div>
              </div>
            </button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["start", "Commencer"],
                  ["discover", "Dose du jour"],
                  ["cards", "Mes cartes"],
                  ["review", "Révision"],
                  ["quiz", "Quiz"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={landingRedirectTarget === key ? "default" : "outline"}
                  disabled={!landingRedirectEnabled || landingRedirectLoading || landingRedirectSaving}
                  onClick={() => {
                    setLandingRedirectTarget(key);
                    void saveLandingRedirect({ target: key });
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </MobileScaffold>
  );
}
