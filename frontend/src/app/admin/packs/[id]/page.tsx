"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { useStaffGuard } from "@/lib/staffGuard";

import { PackBulkAdd } from "./PackBulkAdd";
import { PackCardsList } from "./PackCardsList";
import { PackMetaForm } from "./PackMetaForm";
import { PackSearchPanel } from "./PackSearchPanel";
import { useAdminPackEditor } from "./useAdminPackEditor";

export default function AdminPackDetailPage() {
  const routeParams = useParams<{ id: string }>();
  const packId = Number(routeParams?.id);

  const { checking, isStaff } = useStaffGuard();
  const editor = useAdminPackEditor(packId, isStaff);

  return (
    <MobileScaffold title="Admin — Pack" contentClassName="space-y-4">
      {checking ? <div className="text-sm text-muted-foreground">Vérification…</div> : null}

      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline">
          <Link href="/admin/packs">Retour</Link>
        </Button>
        <div className="text-xs text-muted-foreground">#{packId}</div>
      </div>

      {editor.error ? (
        <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
          {editor.error}
        </div>
      ) : null}

      <PackMetaForm
        pack={editor.pack}
        loading={editor.loading}
        saving={editor.saving}
        coverUploading={editor.coverUploading}
        onReload={editor.reload}
        onSave={editor.savePack}
        onUploadCover={editor.uploadCover}
        onDelete={editor.deletePack}
        onError={editor.setError}
      />

      <PackBulkAdd saving={editor.saving} onBulkAdd={editor.bulkAdd} />

      <PackSearchPanel
        saving={editor.saving}
        searchLoading={editor.searchLoading}
        searchResults={editor.searchResults}
        inCurrentPackIds={editor.inCurrentPackIds}
        onSearch={editor.search}
        onAddOne={editor.addOne}
      />

      <PackCardsList
        cards={editor.pack?.cards}
        saving={editor.saving}
        onSaveOrder={editor.saveOrder}
        onRemove={editor.removeCard}
      />

      <div className="text-xs text-muted-foreground">
        Note: la liste compacte + drag&drop est volontairement simple (HTML5 DnD). On pourra la
        rendre plus puissante ensuite.
      </div>
    </MobileScaffold>
  );
}
