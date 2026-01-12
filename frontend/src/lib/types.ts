export type CursorPage<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

export type TagPayload = {
  id: number;
  name: string;
  slug: string;
};

export type CategoryPayload = {
  id: number;
  name: string;
  slug: string;
};

export type MicroArticleListItem = {
  id: number;
  slug: string;
  title: string;
  answer_express: string;
  takeaway: string;
  key_points: string[];
  cover_image_url: string | null;
  tags: string[];
  tags_payload?: TagPayload[];
  categories_pharmacologie_payload?: CategoryPayload[];
  categories_maladies_payload?: CategoryPayload[];
  categories_classes_payload?: CategoryPayload[];
  published_at?: string | null;
  decks_count?: number;
};

export type DeckSummary = {
  id: number;
  name: string;
  is_default: boolean;
  sort_order: number;
  cards_count: number;
};

export type DeckMembership = {
  id: number;
  name: string;
  is_default: boolean;
  is_member: boolean;
};

export type DeckCardsResponse = {
  count: number;
  results: MicroArticleListItem[];
};

export type StreamBlock = { type: string; value: unknown };

export type MicroArticleDetail = {
  id: number;
  slug: string;
  title: string;
  answer_express: string;
  takeaway: string;
  key_points: string[];
  cover_image_url: string | null;
  links?: StreamBlock[];
  see_more?: StreamBlock[];
  is_saved?: boolean;
  is_read?: boolean;
  tags: string[];
  categories_pharmacologie: string[];
  categories_maladies: string[];
  categories_classes: string[];
  tags_payload?: TagPayload[];
  categories_pharmacologie_payload?: CategoryPayload[];
  categories_maladies_payload?: CategoryPayload[];
  categories_classes_payload?: CategoryPayload[];
  questions?: Array<{
    id: number;
    type: string;
    prompt: string;
    choices?: unknown;
    correct_answers?: unknown;
    explanation?: string;
    difficulty?: number;
    references?: unknown;
  }>;
  published_at?: string | null;
};

export type TaxonomyNode = {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  children: TaxonomyNode[];
};

export type TaxonomyTreeResponse = {
  taxonomy: string;
  tree: TaxonomyNode[];
};

export type TaxonomyResolveResponse = {
  taxonomy: string;
  node_id: number;
  breadcrumb: Array<{ id: number; name: string; slug: string }>;
  canonical_path: string;
};

export type SrsScope = "all_decks" | "deck" | "decks" | "all_cards";
export type SrsRating = "know" | "medium" | "again";

export type SrsState = {
  level: number;
  due_at: string;
  last_reviewed_at?: string | null;
  reviews_count: number;
  last_rating?: string;
};

export type SrsCard = {
  id: number;
  slug: string;
  title: string;
  answer_express: string;
  takeaway: string;
  key_points: string[];
  cover_image_url: string | null;
};

export type SrsNextResponse = {
  card: SrsCard | null;
  srs: SrsState | null;
};
