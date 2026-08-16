"use client";

import type * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen as BookOpenIcon,
  LayoutGrid as LayoutGridIcon,
  Package as PackageIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type ExploreSection = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

export const exploreSections: ExploreSection[] = [
  { href: "/discover", label: "Dose du jour", Icon: LayoutGridIcon },
  { href: "/library", label: "Bibliothèque", Icon: BookOpenIcon },
  { href: "/packs", label: "Packs", Icon: PackageIcon },
];

export const EXPLORE_HOME = exploreSections[0].href;

export function isExplorePath(pathname: string) {
  return exploreSections.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );
}

/**
 * Sous-navigation de la section « Explorer » : les trois façons de trouver du
 * contenu partagent un seul onglet dans la barre du bas.
 */
export function ExploreTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Explorer"
      className="flex gap-1 rounded-lg bg-muted p-1 text-sm"
    >
      {exploreSections.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 transition-colors",
              active
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
