"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen as BookOpenIcon,
  Brain as BrainIcon,
  LayoutGrid as LayoutGridIcon,
  Layers as LayersIcon,
  Menu as MenuIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type TabItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const tabs: TabItem[] = [
  { href: "/discover", label: "Dose du jour", Icon: LayoutGridIcon },
  { href: "/library", label: "Bibliothèque", Icon: BookOpenIcon },
  { href: "/cards", label: "Mes cartes", Icon: LayersIcon },
  { href: "/quiz", label: "Quiz", Icon: BrainIcon },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/discover") return pathname === "/" || pathname.startsWith("/discover");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileScaffold({
  title,
  headerRight,
  children,
  contentClassName,
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="relative mx-auto flex h-12 w-full max-w-3xl items-center justify-between gap-2 px-2">
          <div className="flex items-center">
            <Sheet>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Ouvrir le menu">
                  <MenuIcon className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <SheetHeader className="px-4">
                  <SheetTitle>PharmaPocket</SheetTitle>
                </SheetHeader>
                <Separator />
                <ScrollArea className="h-[calc(100dvh-4rem)] px-2">
                  <div className="space-y-1 p-2">
                    {tabs.map(({ href, label, Icon }) => (
                      <SheetClose key={href} asChild>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent",
                            isActivePath(pathname, href) ? "bg-accent" : ""
                          )}
                        >
                          <Icon className="size-4" />
                          <span className="truncate">{label}</span>
                        </Link>
                      </SheetClose>
                    ))}
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-1 p-2">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                      Thèmes
                    </div>

                    {[
                      { label: "Pharmacologie", count: "12" },
                      { label: "Maladies", count: "5" },
                      { label: "Interactions", count: "3" },
                    ].map((item) => (
                      <SheetClose key={item.label} asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {item.count}
                          </span>
                        </button>
                      </SheetClose>
                    ))}
                  </div>

                  <div className="h-8" />
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="px-14 text-center text-sm font-semibold">{title}</div>
          </div>

          <div className="flex items-center justify-end">{headerRight}</div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-3xl px-4 py-4 pb-20",
          contentClassName
        )}
      >
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl">
          {tabs.map(({ href, label, Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
