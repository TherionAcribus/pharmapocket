"use client";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyAccentColorToDocument,
  clearStoredAccentColor,
  getStoredAccentColor,
  normalizeHexColor,
  setStoredAccentColor,
} from "@/lib/accentColor";
import * as React from "react";

export default function PreferencesPage() {
  const [hex, setHex] = React.useState(() => getStoredAccentColor() ?? "");

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
      </div>
    </MobileScaffold>
  );
}
