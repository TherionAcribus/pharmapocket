import { apiGet, apiJson, jsonBody } from "@/lib/api/client";
import type {
  DeckCardsResponse,
  DeckMembership,
  DeckSummary,
  OfficialPackDetail,
  OfficialPackProgress,
  OfficialPackSummary,
} from "@/lib/types";

/** Forme renvoyée par les écritures sur un deck utilisateur. */
export type DeckWriteResult = {
  id: number;
  name: string;
  is_default: boolean;
  sort_order: number;
};

function deckPath(deckId: number, suffix = ""): string {
  return `/api/v1/content/decks/${encodeURIComponent(String(deckId))}/${suffix}`;
}

// -----------------------------------------------------------------------------
// Decks utilisateur
// -----------------------------------------------------------------------------

export async function fetchDecks(): Promise<DeckSummary[]> {
  return apiGet<DeckSummary[]>(`/api/v1/content/decks/`);
}

export async function createDeck(name: string): Promise<DeckWriteResult> {
  return apiJson<DeckWriteResult>(`/api/v1/content/decks/`, jsonBody("POST", { name }));
}

export async function patchDeck(
  deckId: number,
  input: { name?: string; sort_order?: number }
): Promise<DeckWriteResult> {
  return apiJson<DeckWriteResult>(deckPath(deckId), jsonBody("PATCH", input));
}

export async function deleteDeck(deckId: number): Promise<void> {
  await apiJson<void>(deckPath(deckId), { method: "DELETE" });
}

export async function setDefaultDeck(
  deckId: number
): Promise<{ ok: boolean; default_deck_id: number }> {
  return apiJson<{ ok: boolean; default_deck_id: number }>(deckPath(deckId, "set-default/"), {
    method: "POST",
  });
}

// -----------------------------------------------------------------------------
// Cartes d'un deck
// -----------------------------------------------------------------------------

export async function fetchDeckCards(deckId: number, search?: string): Promise<DeckCardsResponse> {
  const qs = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<DeckCardsResponse>(deckPath(deckId, `cards/${qs}`));
}

export async function addCardToDeck(deckId: number, cardId: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(deckPath(deckId, "cards/"), jsonBody("POST", { card_id: cardId }));
}

export async function removeCardFromDeck(deckId: number, cardId: number): Promise<void> {
  await apiJson<void>(deckPath(deckId, `cards/${encodeURIComponent(String(cardId))}/`), {
    method: "DELETE",
  });
}

export async function bulkAddCardsToDeck(
  deckId: number,
  cardIds: number[]
): Promise<{ added: number; already_present: number }> {
  return apiJson<{ added: number; already_present: number }>(
    deckPath(deckId, "cards/bulk-add/"),
    jsonBody("POST", { card_ids: cardIds })
  );
}

export async function fetchCardDecks(cardId: number): Promise<DeckMembership[]> {
  return apiGet<DeckMembership[]>(
    `/api/v1/content/cards/${encodeURIComponent(String(cardId))}/decks/`
  );
}

export async function updateCardDecks(
  cardId: number,
  deckIds: number[]
): Promise<{ ok: boolean; deck_ids: number[] }> {
  return apiJson<{ ok: boolean; deck_ids: number[] }>(
    `/api/v1/content/cards/${encodeURIComponent(String(cardId))}/decks/`,
    jsonBody("PUT", { deck_ids: deckIds })
  );
}

// -----------------------------------------------------------------------------
// Packs officiels (decks en lecture seule côté utilisateur)
// -----------------------------------------------------------------------------

export async function fetchOfficialPacks(): Promise<OfficialPackSummary[]> {
  return apiGet<OfficialPackSummary[]>(`/api/v1/content/decks/?type=official`);
}

export async function fetchOfficialPackDetail(deckId: number): Promise<OfficialPackDetail> {
  return apiGet<OfficialPackDetail>(deckPath(deckId));
}

export async function startOfficialPack(deckId: number): Promise<OfficialPackProgress> {
  return apiJson<OfficialPackProgress>(deckPath(deckId, "start/"), { method: "POST" });
}

export async function updateOfficialPackProgress(
  deckId: number,
  input: Partial<{
    mode_last: string;
    last_card_id: number | null;
    cards_seen_count: number;
    cards_done_count: number;
  }>
): Promise<OfficialPackProgress> {
  return apiJson<OfficialPackProgress>(deckPath(deckId, "progress/"), jsonBody("POST", input));
}

export async function copyOfficialPackToUserDeck(packId: number): Promise<{ deck_id: number }> {
  return apiJson<{ deck_id: number }>(deckPath(packId, "copy-to-user/"), { method: "POST" });
}
