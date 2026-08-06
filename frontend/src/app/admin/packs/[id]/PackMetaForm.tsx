"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminPackDetail } from "@/lib/types";

function clampIntOrNull(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/** L'API renvoie une URL relative servie par Django, pas par le front. */
function resolveCoverImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base =
    process.env.NEXT_PUBLIC_MEDIA_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const normalizedBase = base && base.includes(":3000") ? base.replace(":3000", ":8000") : base;
  try {
    return new URL(raw, normalizedBase).toString();
  } catch {
    return raw;
  }
}

type PackMetaFormProps = {
  pack: AdminPackDetail | undefined;
  loading: boolean;
  saving: boolean;
  coverUploading: boolean;
  onReload: () => void;
  onSave: (input: {
    name: string;
    description: string;
    difficulty: string;
    estimated_minutes: number | null;
    status: string;
    cover_image_id: number | null;
  }) => Promise<void>;
  onUploadCover: (file: File) => Promise<number | null>;
  onDelete: () => Promise<void>;
  onError: (message: string) => void;
};

/** Métadonnées du pack : champs éditables, cover et suppression. */
export function PackMetaForm({
  pack,
  loading,
  saving,
  coverUploading,
  onReload,
  onSave,
  onUploadCover,
  onDelete,
  onError,
}: PackMetaFormProps) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [estimatedMinutes, setEstimatedMinutes] = React.useState("");
  const [status, setStatus] = React.useState("draft");
  const [coverImageId, setCoverImageId] = React.useState("");
  const [coverFile, setCoverFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (!pack) return;
    setName(pack.name);
    setDescription(pack.description || "");
    setDifficulty(pack.difficulty || "");
    setEstimatedMinutes(pack.estimated_minutes != null ? String(pack.estimated_minutes) : "");
    setStatus(pack.status || "draft");
    setCoverImageId(pack.cover_image?.id != null ? String(pack.cover_image.id) : "");
  }, [pack]);

  const coverImageSrc = React.useMemo(
    () => resolveCoverImageSrc(pack?.cover_image_url),
    [pack?.cover_image_url]
  );

  const onSubmit = () =>
    void onSave({
      name: name.trim(),
      description,
      difficulty,
      estimated_minutes: clampIntOrNull(estimatedMinutes),
      status,
      cover_image_id: clampIntOrNull(coverImageId),
    });

  const onUpload = async () => {
    if (!coverFile) {
      onError("Choisis d’abord un fichier image avant de cliquer sur Uploader.");
      return;
    }
    const uploadedId = await onUploadCover(coverFile);
    if (uploadedId == null) return;
    setCoverImageId(String(uploadedId));
    setCoverFile(null);
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Métadonnées</div>
          <div className="text-xs text-muted-foreground">Packs officiels (admin-only)</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onReload} disabled={loading || saving}>
            {loading ? "Chargement…" : "Recharger"}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={saving}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Nom</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">Description</div>
          <textarea
            className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-sm font-medium">Difficulté</div>
            <Input
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder="beginner / …"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Minutes estimées</div>
            <Input
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-sm font-medium">Statut</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Cover image id</div>
            <Input value={coverImageId} onChange={(e) => setCoverImageId(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Upload cover</div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={coverUploading}
              onClick={() => void onUpload()}
            >
              {coverUploading ? "Upload…" : "Uploader et associer"}
            </Button>
            <div className="text-xs text-muted-foreground self-center truncate">
              {coverFile ? coverFile.name : "Aucun fichier sélectionné"}
            </div>
          </div>
        </div>

        {coverImageSrc ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Cover actuelle</div>
            <div className="inline-block rounded-md border bg-background p-2">
              <img src={coverImageSrc} alt="Cover pack" className="h-32 w-32 object-cover rounded" />
            </div>
            <div className="text-[11px] text-muted-foreground truncate max-w-xs">
              {coverImageSrc}
            </div>
          </div>
        ) : null}
      </div>

      <div className="pt-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => void onDelete()}
          disabled={saving}
        >
          Supprimer le pack
        </Button>
      </div>
    </div>
  );
}
