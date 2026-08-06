"use client";

/**
 * Couche TanStack Query au-dessus de `lib/api.ts`.
 *
 * Les pages ne font plus de `useState`/`useEffect` pour charger : elles
 * consomment ces hooks, qui mutualisent cache, dédoublonnage et invalidation.
 * `lib/api.ts` reste la seule couche qui connaît les URLs et le transport.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  adminMicroArticleSearch,
  adminPackBulkAdd,
  adminPackRemoveCard,
  adminPackReorder,
  adminUploadImage,
  bulkAddCardsToDeck,
  copyOfficialPackToUserDeck,
  createAdminPack,
  createAdminThumbOverride,
  createDeck,
  deleteAdminPack,
  deleteAdminThumbOverride,
  deleteDeck,
  deleteAccount,
  fetchAccount,
  fetchAdminPack,
  fetchAdminPacks,
  fetchAdminThumbOverrides,
  fetchCardDecks,
  fetchDeckCards,
  fetchDecks,
  fetchDiscoverFeed,
  fetchFeed,
  fetchLanding,
  fetchMe,
  fetchMicroArticleReadStates,
  fetchMicroArticleSavedStatus,
  fetchOfficialPackDetail,
  fetchOfficialPacks,
  fetchPreferences,
  fetchSrsNext,
  fetchTags,
  fetchTaxonomyTree,
  fetchThumbOverridesPublic,
  isApiError,
  patchAccount,
  patchAdminPack,
  patchAdminThumbOverride,
  patchDeck,
  patchPreferences,
  postSrsReview,
  removeCardFromDeck,
  saveMicroArticle,
  setMicroArticleReadState,
  startOfficialPack,
  unsaveMicroArticle,
  updateCardDecks,
  updateOfficialPackProgress,
  type AdminThumbOverride,
  type FeedQuery,
  type SrsNextQuery,
} from "@/lib/api";
import type {
  AccountSummary,
  CurrentUser,
  PaginatedMicroArticleListItemList,
  SrsNext,
  UserPreferences,
} from "@/lib/types";

type Taxonomy = Parameters<typeof fetchTaxonomyTree>[0];
export type FeedSource = "content" | "discover";

// -----------------------------------------------------------------------------
// Clés de cache
// -----------------------------------------------------------------------------

export const queryKeys = {
  me: ["me"] as const,
  account: ["account"] as const,
  preferences: ["preferences"] as const,
  landing: ["landing"] as const,
  thumbOverrides: ["thumb-overrides"] as const,

  decks: ["decks"] as const,
  deckCards: (deckId: number, search?: string) =>
    ["deck-cards", deckId, search?.trim() || ""] as const,
  cardDecks: (cardId: number) => ["card-decks", cardId] as const,

  officialPacks: ["official-packs"] as const,
  officialPack: (packId: number) => ["official-pack", packId] as const,

  feed: (source: FeedSource, query: FeedQuery) => ["feed", source, normalizeFeedQuery(query)] as const,
  savedStatus: (slug: string) => ["saved-status", slug] as const,
  readStates: (slugs: string[]) => ["read-states", [...slugs].sort().join(",")] as const,

  taxonomyTree: (taxonomy: Taxonomy) => ["taxonomy-tree", taxonomy] as const,
  tags: (q: string | undefined, limit: number) => ["tags", q?.trim() || "", limit] as const,

  srsNext: (query: SrsNextQuery) => ["srs-next", query] as const,

  adminPacks: ["admin", "packs"] as const,
  adminPack: (packId: number) => ["admin", "pack", packId] as const,
  adminThumbOverrides: ["admin", "thumb-overrides"] as const,
};

/**
 * Deux objets `FeedQuery` équivalents doivent produire la même clé : on fige
 * l'ordre des champs et on gomme `undefined` / `null` / tableau vide.
 */
function normalizeFeedQuery(query: FeedQuery) {
  return {
    q: query.q?.trim() || "",
    tags: query.tags?.length ? [...query.tags].sort().join(",") : "",
    taxonomy: query.taxonomy ?? "",
    node: query.node ?? "",
    scope: query.scope ?? "",
  };
}

function cursorFromUrl(nextUrl: string | null | undefined): string | null {
  if (!nextUrl) return null;
  try {
    return new URL(nextUrl).searchParams.get("cursor");
  } catch {
    // L'API peut renvoyer une URL relative.
    try {
      return new URL(nextUrl, "http://localhost").searchParams.get("cursor");
    } catch {
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

/**
 * `null` = visiteur anonyme. L'API répond 401 dans ce cas, ce qui est un état
 * normal et non une erreur : on l'aplatit ici pour que toutes les pages
 * puissent écrire `const { data: me } = useMe()`.
 */
export function useMe() {
  return useQuery<CurrentUser | null>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await fetchMe();
      } catch (e) {
        if (isApiError(e) && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** Après login/logout, tout le cache dépend d'une autre identité. */
export async function resetSessionCache(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  await queryClient.invalidateQueries({ queryKey: queryKeys.me });
}

export function useAccount() {
  return useQuery<AccountSummary | null>({
    queryKey: queryKeys.account,
    queryFn: async () => {
      try {
        return await fetchAccount();
      } catch (e) {
        if (isApiError(e) && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
  });
}

export function usePatchAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchAccount,
    onSuccess: (account) => {
      queryClient.setQueryData(queryKeys.account, account);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: deleteAccount });
}

export function usePreferences(enabled = true) {
  return useQuery<UserPreferences>({
    queryKey: queryKeys.preferences,
    queryFn: fetchPreferences,
    enabled,
  });
}

export function usePatchPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPreferences,
    onSuccess: (prefs) => {
      queryClient.setQueryData(queryKeys.preferences, prefs);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

// -----------------------------------------------------------------------------
// Contenu public
// -----------------------------------------------------------------------------

export function useLanding() {
  return useQuery({ queryKey: queryKeys.landing, queryFn: fetchLanding });
}

export function useThumbOverridesQuery() {
  return useQuery({
    queryKey: queryKeys.thumbOverrides,
    queryFn: fetchThumbOverridesPublic,
    // Données quasi statiques, relues par beaucoup de vignettes à la fois.
    staleTime: 10 * 60_000,
  });
}

export function useTaxonomyTree(taxonomy: Taxonomy, enabled = true) {
  return useQuery({
    queryKey: queryKeys.taxonomyTree(taxonomy),
    queryFn: () => fetchTaxonomyTree(taxonomy),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useTags(q?: string, limit = 200) {
  return useQuery({
    queryKey: queryKeys.tags(q, limit),
    queryFn: () => fetchTags(q, limit),
    staleTime: 5 * 60_000,
  });
}

export function useFeed(source: FeedSource, query: FeedQuery) {
  return useInfiniteQuery<PaginatedMicroArticleListItemList>({
    queryKey: queryKeys.feed(source, query),
    queryFn: ({ pageParam }) =>
      (source === "discover" ? fetchDiscoverFeed : fetchFeed)({
        ...query,
        cursor: (pageParam as string | null) ?? null,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => cursorFromUrl(lastPage.next),
  });
}

export function useReadStates(slugs: string[], enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.readStates(slugs),
    queryFn: () => fetchMicroArticleReadStates(slugs),
    enabled: enabled && slugs.length > 0,
  });
}

export function useSetReadState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, isRead }: { slug: string; isRead: boolean }) =>
      setMicroArticleReadState(slug, isRead),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["read-states"] });
    },
  });
}

export function useSavedStatus(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.savedStatus(slug),
    queryFn: () => fetchMicroArticleSavedStatus(slug),
    enabled,
  });
}

export function useToggleSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, saved }: { slug: string; saved: boolean }) => {
      if (saved) await saveMicroArticle(slug);
      else await unsaveMicroArticle(slug);
      return { slug, saved };
    },
    onSuccess: ({ slug, saved }) => {
      queryClient.setQueryData(queryKeys.savedStatus(slug), { saved });
    },
  });
}

// -----------------------------------------------------------------------------
// Decks utilisateur
// -----------------------------------------------------------------------------

export function useDecks(enabled = true) {
  return useQuery({
    queryKey: queryKeys.decks,
    queryFn: fetchDecks,
    enabled,
  });
}

export function useDeckCards(deckId: number | null, search?: string) {
  return useQuery({
    queryKey: queryKeys.deckCards(deckId ?? -1, search),
    queryFn: () => fetchDeckCards(deckId as number, search),
    enabled: deckId != null,
  });
}

export function useCardDecks(cardId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.cardDecks(cardId),
    queryFn: () => fetchCardDecks(cardId),
    enabled,
  });
}

/** Toute écriture sur les decks change à la fois la liste et son contenu. */
function invalidateDecks(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
  void queryClient.invalidateQueries({ queryKey: ["deck-cards"] });
  void queryClient.invalidateQueries({ queryKey: ["card-decks"] });
}

export function useCreateDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDeck(name),
    onSuccess: () => invalidateDecks(queryClient),
  });
}

export function usePatchDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, input }: { deckId: number; input: { name?: string; sort_order?: number } }) =>
      patchDeck(deckId, input),
    onSuccess: () => invalidateDecks(queryClient),
  });
}

export function useDeleteDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deckId: number) => deleteDeck(deckId),
    onSuccess: () => invalidateDecks(queryClient),
  });
}

export function useRemoveCardsFromDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deckId, cardIds }: { deckId: number; cardIds: number[] }) => {
      await Promise.all(cardIds.map((id) => removeCardFromDeck(deckId, id)));
    },
    onSuccess: () => invalidateDecks(queryClient),
  });
}

export function useBulkAddCardsToDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, cardIds }: { deckId: number; cardIds: number[] }) =>
      bulkAddCardsToDeck(deckId, cardIds),
    onSuccess: () => invalidateDecks(queryClient),
  });
}

export function useUpdateCardDecks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, deckIds }: { cardId: number; deckIds: number[] }) =>
      updateCardDecks(cardId, deckIds),
    onSuccess: () => invalidateDecks(queryClient),
  });
}

// -----------------------------------------------------------------------------
// Packs officiels
// -----------------------------------------------------------------------------

export function useOfficialPacks() {
  return useQuery({ queryKey: queryKeys.officialPacks, queryFn: fetchOfficialPacks });
}

export function useOfficialPack(packId: number) {
  return useQuery({
    queryKey: queryKeys.officialPack(packId),
    queryFn: () => fetchOfficialPackDetail(packId),
    enabled: Number.isFinite(packId),
  });
}

export function useStartOfficialPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packId: number) => startOfficialPack(packId),
    onSuccess: (_data, packId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.officialPack(packId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.officialPacks });
    },
  });
}

export function useUpdateOfficialPackProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deckId,
      input,
    }: {
      deckId: number;
      input: Parameters<typeof updateOfficialPackProgress>[1];
    }) => updateOfficialPackProgress(deckId, input),
    onSuccess: (_data, { deckId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.officialPack(deckId) });
    },
  });
}

export function useCopyOfficialPackToUserDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packId: number) => copyOfficialPackToUserDeck(packId),
    onSuccess: () => invalidateDecks(queryClient),
  });
}

// -----------------------------------------------------------------------------
// Révision (SRS)
// -----------------------------------------------------------------------------

/**
 * `enabled` est piloté par la page : la session ne démarre que sur action
 * explicite de l'utilisateur, jamais au montage.
 *
 * `staleTime: 0` / `gcTime: 0` : « la carte suivante » n'a aucun sens en cache,
 * chaque demande doit interroger le serveur.
 */
export function useSrsNext(query: SrsNextQuery, enabled: boolean) {
  return useQuery<SrsNext>({
    queryKey: queryKeys.srsNext(query),
    queryFn: () => fetchSrsNext(query),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

/** La réponse de l'API contient déjà la carte suivante : on la pose en cache. */
export function useRateSrsCard(query: SrsNextQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postSrsReview,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.srsNext(query), next);
    },
  });
}

// -----------------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------------

export function useAdminPacks(enabled = true) {
  return useQuery({ queryKey: queryKeys.adminPacks, queryFn: fetchAdminPacks, enabled });
}

export function useAdminPack(packId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminPack(packId),
    queryFn: () => fetchAdminPack(packId),
    enabled: enabled && Number.isFinite(packId),
  });
}

function invalidateAdminPack(queryClient: QueryClient, packId?: number) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminPacks });
  void queryClient.invalidateQueries({ queryKey: queryKeys.officialPacks });
  if (packId != null) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminPack(packId) });
  }
}

export function useCreateAdminPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminPack,
    onSuccess: () => invalidateAdminPack(queryClient),
  });
}

export function usePatchAdminPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      packId,
      input,
    }: {
      packId: number;
      input: Parameters<typeof patchAdminPack>[1];
    }) => patchAdminPack(packId, input),
    onSuccess: (_data, { packId }) => invalidateAdminPack(queryClient, packId),
  });
}

export function useDeleteAdminPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packId: number) => deleteAdminPack(packId),
    onSuccess: (_data, packId) => invalidateAdminPack(queryClient, packId),
  });
}

export function useAdminPackBulkAdd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      packId,
      input,
    }: {
      packId: number;
      input: Parameters<typeof adminPackBulkAdd>[1];
    }) => adminPackBulkAdd(packId, input),
    onSuccess: (_data, { packId }) => invalidateAdminPack(queryClient, packId),
  });
}

export function useAdminPackRemoveCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packId, cardId }: { packId: number; cardId: number }) =>
      adminPackRemoveCard(packId, cardId),
    onSuccess: (_data, { packId }) => invalidateAdminPack(queryClient, packId),
  });
}

export function useAdminPackReorder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packId, cardIds }: { packId: number; cardIds: number[] }) =>
      adminPackReorder(packId, cardIds),
    onSuccess: (_data, { packId }) => invalidateAdminPack(queryClient, packId),
  });
}

export function useAdminUploadImage() {
  return useMutation({ mutationFn: adminUploadImage });
}

export function useAdminMicroArticleSearch() {
  // Recherche déclenchée à la demande, avec des critères composites : une
  // mutation exprime mieux ce « lance la requête maintenant » qu'un `useQuery`.
  return useMutation({ mutationFn: adminMicroArticleSearch });
}

export function useAdminThumbOverrides(enabled = true) {
  return useQuery<AdminThumbOverride[]>({
    queryKey: queryKeys.adminThumbOverrides,
    queryFn: fetchAdminThumbOverrides,
    enabled,
  });
}

function invalidateThumbOverrides(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminThumbOverrides });
  void queryClient.invalidateQueries({ queryKey: queryKeys.thumbOverrides });
}

export function useCreateAdminThumbOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminThumbOverride,
    onSuccess: () => invalidateThumbOverrides(queryClient),
  });
}

export function usePatchAdminThumbOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      pathologySlug,
      input,
    }: {
      pathologySlug: string;
      input: Parameters<typeof patchAdminThumbOverride>[1];
    }) => patchAdminThumbOverride(pathologySlug, input),
    onSuccess: () => invalidateThumbOverrides(queryClient),
  });
}

export function useDeleteAdminThumbOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pathologySlug: string) => deleteAdminThumbOverride(pathologySlug),
    onSuccess: () => invalidateThumbOverrides(queryClient),
  });
}
