"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Package as PackageIcon } from "lucide-react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { fetchMe } from "@/lib/api";

export default function AdminHomePage() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.is_staff) {
          router.replace("/discover");
          return;
        }
      })
      .catch(() => {
        if (cancelled) return;
        router.replace("/account/login");
      })
      .finally(() => {
        if (cancelled) return;
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <MobileScaffold title="Admin" contentClassName="space-y-4">
      {checking ? <div className="text-sm text-muted-foreground">Vérification…</div> : null}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Outils</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link href="/admin/vignettes">
              <ImageIcon className="size-4" />
              Vignettes
            </Link>
          </Button>

          <Button asChild variant="outline" className="justify-start gap-2">
            <Link href="/admin/packs">
              <PackageIcon className="size-4" />
              Packs
            </Link>
          </Button>
        </div>
      </div>
    </MobileScaffold>
  );
}
