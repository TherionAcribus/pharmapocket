"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen as BookOpenIcon,
  Brain as BrainIcon,
  Clock as ClockIcon,
  LayoutGrid as LayoutGridIcon,
  Layers as LayersIcon,
  LogIn as LogInIcon,
  LogOut as LogOutIcon,
  Menu as MenuIcon,
  Settings as SettingsIcon,
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
import { authLogout, fetchMe, fetchTaxonomyTree } from "@/lib/api";
import { ensureProgressSyncLoop, setProgressSyncEnabled } from "@/lib/progressSync";
import type { TaxonomyNode, TaxonomyTreeResponse } from "@/lib/types";

type TabItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const tabs: TabItem[] = [
  { href: "/discover", label: "Dose du jour", Icon: LayoutGridIcon },
  { href: "/library", label: "Bibliothèque", Icon: BookOpenIcon },
  { href: "/cards", label: "Mes cartes", Icon: LayersIcon },
  { href: "/review", label: "À revoir", Icon: ClockIcon },
  { href: "/quiz", label: "Quiz", Icon: BrainIcon },
];

type Taxonomy = "pharmacologie" | "maladies" | "classes";

function isActivePath(pathname: string, href: string) {
  if (href === "/discover") return pathname === "/" || pathname.startsWith("/discover");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TaxonomyTreeNav({
  nodes,
  depth = 0,
  onSelect,
}: {
  nodes: TaxonomyNode[];
  depth?: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="space-y-1">
      {nodes.map((n) => (
        <div key={n.id} className="space-y-1">
          <SheetClose asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                depth ? "text-muted-foreground" : ""
              )}
              style={{ paddingLeft: `${12 + depth * 12}px` }}
              onClick={() => onSelect(n.id)}
            >
              <span className="truncate">{n.name}</span>
            </button>
          </SheetClose>
          {n.children?.length ? (
            <TaxonomyTreeNav nodes={n.children} depth={depth + 1} onSelect={onSelect} />
          ) : null}
        </div>
      ))}
    </div>
  );
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
  const router = useRouter();

  const [taxonomy, setTaxonomy] = React.useState<Taxonomy>("pharmacologie");
  const [tree, setTree] = React.useState<TaxonomyTreeResponse | null>(null);
  const [loadingTree, setLoadingTree] = React.useState(false);

  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingTree(true);
    fetchTaxonomyTree(taxonomy)
      .then((t) => {
        if (cancelled) return;
        setTree(t);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingTree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taxonomy]);

  React.useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        setCurrentUserEmail(me.email || null);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUserEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    ensureProgressSyncLoop();
    setProgressSyncEnabled(Boolean(currentUserEmail));
  }, [currentUserEmail]);

  const goToTaxonomy = (t: Taxonomy) => {
    setTaxonomy(t);
    router.push(`/library?taxonomy=${encodeURIComponent(t)}&scope=subtree`);
  };

  const goToNode = (id: number) => {
    router.push(
      `/library?taxonomy=${encodeURIComponent(taxonomy)}&node=${encodeURIComponent(
        String(id)
      )}&scope=subtree`
    );
  };

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

                    <div className="flex flex-wrap gap-2 px-2 pb-2">
                      {(["pharmacologie", "maladies", "classes"] as Taxonomy[]).map((t) => (
                        <SheetClose key={t} asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant={taxonomy === t ? "default" : "outline"}
                            onClick={() => goToTaxonomy(t)}
                          >
                            {t}
                          </Button>
                        </SheetClose>
                      ))}
                    </div>

                    <div className="px-2">
                      {loadingTree ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">Chargement…</div>
                      ) : null}
                      {!loadingTree && tree?.tree?.length ? (
                        <TaxonomyTreeNav nodes={tree.tree} onSelect={goToNode} />
                      ) : null}
                      {!loadingTree && !tree?.tree?.length ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">Aucune donnée.</div>
                      ) : null}
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-1 p-2">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                      Compte
                    </div>

                    {currentUserEmail ? (
                      <div className="space-y-1">
                        <div className="px-3 py-1 text-xs text-muted-foreground truncate">
                          {currentUserEmail}
                        </div>

                        <SheetClose asChild>
                          <Link
                            href="/account/preferences"
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
                          >
                            <SettingsIcon className="size-4" />
                            <span className="truncate">Préférences</span>
                          </Link>
                        </SheetClose>

                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              authLogout()
                                .catch(() => {})
                                .finally(() => {
                                  setCurrentUserEmail(null);
                                  router.push("/discover");
                                });
                            }}
                          >
                            <LogOutIcon className="size-4" />
                            <span className="truncate">Déconnexion</span>
                          </button>
                        </SheetClose>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <SheetClose asChild>
                          <Link
                            href="/account/login"
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
                          >
                            <LogInIcon className="size-4" />
                            <span className="truncate">Connexion</span>
                          </Link>
                        </SheetClose>

                        <SheetClose asChild>
                          <Link
                            href="/account/signup"
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
                          >
                            <LogInIcon className="size-4" />
                            <span className="truncate">Inscription</span>
                          </Link>
                        </SheetClose>
                      </div>
                    )}
                  </div>

                  <div className="h-4" />
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
