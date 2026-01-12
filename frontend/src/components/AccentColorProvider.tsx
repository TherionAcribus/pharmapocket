"use client";

import * as React from "react";

import {
  applyAccentColorToDocument,
  getStoredAccentColor,
} from "@/lib/accentColor";

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    applyAccentColorToDocument(getStoredAccentColor());

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "pp_accent_color") return;
      applyAccentColorToDocument(getStoredAccentColor());
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return <>{children}</>;
}
