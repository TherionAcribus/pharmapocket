"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  useAdminMicroArticleSearch,
  useAdminPack,
  useAdminPackBulkAdd,
  useAdminPackRemoveCard,
  useAdminPackReorder,
  useAdminUploadImage,
  useDeleteAdminPack,
  usePatchAdminPack,
} from "@/lib/queries";
import type { AdminMicroArticleSearchQuery, AdminPackInput } from "@/lib/api/admin";
import type { AdminPackDetail } from "@/lib/types";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export type AdminPackEditor = {
  pack: AdminPackDetail | undefined;
  loading: boolean;
  /** Vrai dès qu'une écriture est en vol : toutes les sections se verrouillent. */
  saving: boolean;
  coverUploading: boolean;
  error: string | null;
  /** Pour les erreurs de saisie détectées par un panneau avant tout appel. */
  setError: (message: string | null) => void;
  reload: () => void;

  savePack: (input: Partial<AdminPackInput>) => Promise<void>;
  /** Renvoie l'id de l'image uploadée, ou `null` si l'upload a échoué. */
  uploadCover: (file: File) => Promise<number | null>;
  deletePack: () => Promise<void>;

  /** Renvoie le compte-rendu à afficher, ou `null` en cas d'erreur. */
  bulkAdd: (items: string) => Promise<string | null>;
  addOne: (microarticleId: number) => Promise<void>;
  removeCard: (cardId: number) => Promise<void>;
  saveOrder: (cardIds: number[]) => Promise<void>;

  search: (criteria: AdminMicroArticleSearchQuery) => void;
  searchResults: ReturnType<typeof useAdminMicroArticleSearch>["data"];
  searchLoading: boolean;
  /** Cartes déjà dans le pack, ajouts optimistes compris. */
  inCurrentPackIds: Set<number>;
};

/**
 * Charge un pack et regroupe toutes ses écritures.
 *
 * Les panneaux de la page ne connaissent que ces actions : elles renvoient
 * leur résultat et publient elles-mêmes l'erreur, pour qu'aucun panneau n'ait
 * à manipuler les mutations.
 */
export function useAdminPackEditor(packId: number, enabled: boolean): AdminPackEditor {
  const router = useRouter();

  const {
    data: pack,
    isFetching: loading,
    error: packError,
    refetch: reload,
  } = useAdminPack(packId, enabled);

  const patchPackMutation = usePatchAdminPack();
  const deletePackMutation = useDeleteAdminPack();
  const bulkAddMutation = useAdminPackBulkAdd();
  const removeCardMutation = useAdminPackRemoveCard();
  const reorderMutation = useAdminPackReorder();
  const uploadImageMutation = useAdminUploadImage();
  const searchMutation = useAdminMicroArticleSearch();

  const [actionError, setActionError] = React.useState<string | null>(null);
  const error = actionError ?? (packError ? toErrorMessage(packError) : null);

  const saving =
    patchPackMutation.isPending ||
    deletePackMutation.isPending ||
    bulkAddMutation.isPending ||
    removeCardMutation.isPending ||
    reorderMutation.isPending;

  // Le serveur ne renvoie le pack qu'après invalidation : on marque l'ajout
  // localement pour que le bouton passe à « déjà dans le pack » sans attendre.
  const [optimisticAddedIds, setOptimisticAddedIds] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (pack) setOptimisticAddedIds([]);
  }, [pack]);

  const inCurrentPackIds = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of pack?.cards ?? []) set.add(c.id);
    for (const id of optimisticAddedIds) set.add(id);
    return set;
  }, [pack?.cards, optimisticAddedIds]);

  const hasPackId = Number.isFinite(packId);

  const savePack = async (input: Partial<AdminPackInput>) => {
    if (!hasPackId) return;
    setActionError(null);
    try {
      await patchPackMutation.mutateAsync({ packId, input });
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const uploadCover = async (file: File): Promise<number | null> => {
    setActionError(null);
    try {
      const uploaded = await uploadImageMutation.mutateAsync({
        file,
        title: `Pack ${packId} cover`,
      });
      await patchPackMutation.mutateAsync({ packId, input: { cover_image_id: uploaded.id } });
      return uploaded.id;
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
      return null;
    }
  };

  const deletePack = async () => {
    if (!hasPackId) return;
    if (!confirm("Supprimer ce pack ?")) return;
    setActionError(null);
    try {
      await deletePackMutation.mutateAsync(packId);
      router.replace("/admin/packs");
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const bulkAdd = async (items: string): Promise<string | null> => {
    if (!hasPackId) return null;
    setActionError(null);
    try {
      const res = await bulkAddMutation.mutateAsync({ packId, input: { items } });
      return `Ajoutées: ${res.added}, déjà présentes: ${res.already_present}, introuvables: ${res.not_found}`;
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
      return null;
    }
  };

  const addOne = async (microarticleId: number) => {
    if (!hasPackId) return;
    if (inCurrentPackIds.has(microarticleId)) return;
    setActionError(null);
    setOptimisticAddedIds((prev) =>
      prev.includes(microarticleId) ? prev : [...prev, microarticleId]
    );
    try {
      await bulkAddMutation.mutateAsync({ packId, input: { microarticle_ids: [microarticleId] } });
    } catch (e: unknown) {
      setOptimisticAddedIds((prev) => prev.filter((x) => x !== microarticleId));
      setActionError(toErrorMessage(e));
    }
  };

  const removeCard = async (cardId: number) => {
    if (!hasPackId) return;
    setActionError(null);
    try {
      await removeCardMutation.mutateAsync({ packId, cardId });
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  const saveOrder = async (cardIds: number[]) => {
    if (!hasPackId || !cardIds.length) return;
    setActionError(null);
    try {
      await reorderMutation.mutateAsync({ packId, cardIds });
    } catch (e: unknown) {
      setActionError(toErrorMessage(e));
    }
  };

  return {
    pack,
    loading,
    saving,
    coverUploading: uploadImageMutation.isPending,
    error,
    setError: setActionError,
    reload: () => void reload(),

    savePack,
    uploadCover,
    deletePack,

    bulkAdd,
    addOne,
    removeCard,
    saveOrder,

    search: (criteria) => searchMutation.mutate(criteria),
    searchResults: searchMutation.data,
    searchLoading: searchMutation.isPending,
    inCurrentPackIds,
  };
}
