"use client";

import Link from "next/link";
import { Image as ImageIcon, Package as PackageIcon } from "lucide-react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { useStaffGuard } from "@/lib/staffGuard";

export default function AdminHomePage() {
  const { checking } = useStaffGuard();

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
