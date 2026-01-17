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

export type ImagePayload = {
  id: number;
  title: string;
  url: string | null;
  credit_text?: string | null;
  credit_author?: string | null;
  credit_source?: string | null;
  credit_source_url?: string | null;
  credit_license?: string | null;
  credit_license_url?: string | null;
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
  cover_image_credit?: string | null;
  cover_image?: ImagePayload | null;
  tags: string[];
  tags_payload?: TagPayload[];
  categories_theme_payload?: CategoryPayload[];
  categories_maladies_payload?: CategoryPayload[];
  categories_medicament_payload?: CategoryPayload[];
  categories_pharmacologie_payload?: CategoryPayload[];
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

export type OfficialPackProgress = {
  started_at: string;
  last_seen_at: string;
  cards_seen_count: number;
  cards_done_count: number;
  progress_pct: number;
  mode_last: string;
  last_card_id: number | null;
};

export type OfficialPackSummary = {
  id: number;
  name: string;
  description: string;
  cover_image_url: string | null;
  cover_image_credit?: string | null;
  cover_image?: ImagePayload | null;
  difficulty: string;
  estimated_minutes: number | null;
  status: string;
  type: string;
  cards_count: number;
  progress?: OfficialPackProgress | null;
};

export type OfficialPackDetail = OfficialPackSummary & {
  cards: MicroArticleListItem[];
};

export type AdminMicroArticleSearchResult = {
  id: number;
  slug: string;
  title: string;
};

export type AdminPackSummary = {
  id: number;
  name: string;
  description: string;
  difficulty: string;
  estimated_minutes: number | null;
  status: string;
  type: string;
  sort_order: number;
  cards_count: number;
  cover_image_url: string | null;
  cover_image_credit?: string | null;
  cover_image?: ImagePayload | null;
};

export type AdminPackDetail = Omit<AdminPackSummary, "cards_count"> & {
  cards_count: number;
  cards: Array<
    MicroArticleListItem & {
      deck_card_id: number;
      sort_order: number;
      position: number;
      is_optional: boolean;
      notes: string;
    }
  >;
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
  cover_image_credit?: string | null;
  cover_image?: ImagePayload | null;
  links?: StreamBlock[];
  see_more?: StreamBlock[];
  is_saved?: boolean;
  is_read?: boolean;
  tags: string[];
  categories_theme?: string[];
  categories_maladies: string[];
  categories_medicament?: string[];
  categories_pharmacologie?: string[];
  categories_classes?: string[];
  tags_payload?: TagPayload[];
  categories_theme_payload?: CategoryPayload[];
  categories_maladies_payload?: CategoryPayload[];
  categories_medicament_payload?: CategoryPayload[];
  categories_pharmacologie_payload?: CategoryPayload[];
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

export type LessonProgress = {
  lesson_id: number;
  seen: boolean;
  completed: boolean;
  percent: number;
  time_ms: number;
  score_best: number | null;
  score_last: number | null;
  updated_at: string;
  last_seen_at: string | null;
};

export type LessonProgressUpdate = {
  seen?: boolean;
  completed?: boolean;
  percent?: number;
  time_ms?: number;
  score_best?: number | null;
  score_last?: number | null;
  updated_at: string;
  last_seen_at?: string | null;
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
  cover_image_credit?: string | null;
  cover_image?: ImagePayload | null;
};

export type SrsNextResponse = {
  card: SrsCard | null;
  srs: SrsState | null;
};

export type LandingStep = {
  title: string;
  detail: string;
};

export type LandingCard = {
  title: string;
  summary: string;
  cta_label: string;
  href: string;
};

export type LandingPayload = {
  title: string;
  hero_title: string;
  hero_subtitle: string;
  hero_bullets: string[];
  steps: LandingStep[];
  cards: LandingCard[];
  primary_cta_label: string;
  primary_cta_target: string;
  secondary_cta_label: string;
  secondary_cta_target: string;
};
