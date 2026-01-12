import type { LessonProgress, LessonProgressUpdate } from "@/lib/types";

type LocalLessonProgress = LessonProgressUpdate & {
  seen: boolean;
  completed: boolean;
  percent: number;
  time_ms: number;
  score_best: number | null;
  score_last: number | null;
  last_seen_at: string | null;
};

type LocalProgressState = {
  schema_version: number;
  device_id: string;
  locale: string | null;
  lessons: Record<string, LocalLessonProgress>;
  pending: string[];
  last_sync_at: string | null;
};

const STORAGE_KEY = "pp_progress_v1";
const SCHEMA_VERSION = 1;
const DEFAULT_MAX_SESSION_MS = 30 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function isAfter(a?: string | null, b?: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function generateDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function defaultState(): LocalProgressState {
  return {
    schema_version: SCHEMA_VERSION,
    device_id: generateDeviceId(),
    locale: typeof navigator !== "undefined" ? navigator.language : null,
    lessons: {},
    pending: [],
    last_sync_at: null,
  };
}

function normalizeLesson(raw: Partial<LocalLessonProgress> | null | undefined): LocalLessonProgress {
  return {
    seen: Boolean(raw?.seen),
    completed: Boolean(raw?.completed),
    percent: clampPercent(raw?.percent ?? 0),
    time_ms: Math.max(0, Math.floor(raw?.time_ms ?? 0)),
    score_best: raw?.score_best ?? null,
    score_last: raw?.score_last ?? null,
    updated_at: raw?.updated_at || nowIso(),
    last_seen_at: raw?.last_seen_at ?? null,
  };
}

function normalizeState(raw: Partial<LocalProgressState> | null): LocalProgressState {
  if (!raw || raw.schema_version !== SCHEMA_VERSION) {
    return defaultState();
  }

  const lessons: Record<string, LocalLessonProgress> = {};
  const rawLessons = raw.lessons || {};
  for (const [id, progress] of Object.entries(rawLessons)) {
    lessons[id] = normalizeLesson(progress);
  }

  return {
    schema_version: SCHEMA_VERSION,
    device_id: raw.device_id || generateDeviceId(),
    locale: raw.locale ?? (typeof navigator !== "undefined" ? navigator.language : null),
    lessons,
    pending: Array.isArray(raw.pending) ? Array.from(new Set(raw.pending.map(String))) : [],
    last_sync_at: raw.last_sync_at ?? null,
  };
}

function readState(): LocalProgressState {
  const storage = getStorage();
  if (!storage) return defaultState();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as Partial<LocalProgressState>;
    return normalizeState(parsed);
  } catch {
    return defaultState();
  }
}

function writeState(state: LocalProgressState): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensurePending(state: LocalProgressState, lessonId: string): void {
  if (!state.pending.includes(lessonId)) {
    state.pending.push(lessonId);
  }
}

export function getLocalProgressState(): LocalProgressState {
  return readState();
}

export function getLessonProgress(lessonId: number): LocalLessonProgress | null {
  const state = readState();
  return state.lessons[String(lessonId)] ?? null;
}

export function upsertLessonProgress(
  lessonId: number,
  updates: Partial<LocalLessonProgress> & { time_ms_delta?: number }
): LocalLessonProgress {
  const state = readState();
  const id = String(lessonId);
  const existing = normalizeLesson(state.lessons[id]);
  const now = nowIso();
  const next = { ...existing };

  if (typeof updates.time_ms_delta === "number") {
    const delta = Math.max(0, Math.floor(updates.time_ms_delta));
    next.time_ms = Math.max(0, next.time_ms + delta);
  }

  if (typeof updates.time_ms === "number") {
    next.time_ms = Math.max(0, Math.floor(updates.time_ms));
  }

  if (typeof updates.percent === "number") {
    next.percent = clampPercent(updates.percent);
  }

  if (typeof updates.seen === "boolean") {
    next.seen = updates.seen;
  }

  if (typeof updates.completed === "boolean") {
    next.completed = updates.completed;
    if (updates.completed && updates.percent === undefined) {
      next.percent = 100;
    }
  }

  if (updates.score_best !== undefined) {
    next.score_best = updates.score_best;
  }

  if (updates.score_last !== undefined) {
    next.score_last = updates.score_last;
  }

  if (updates.last_seen_at !== undefined) {
    next.last_seen_at = updates.last_seen_at;
  }

  next.updated_at = updates.updated_at || now;

  state.lessons[id] = next;
  ensurePending(state, id);
  writeState(state);
  return next;
}

export function markLessonSeen(lessonId: number): LocalLessonProgress {
  const now = nowIso();
  return upsertLessonProgress(lessonId, {
    seen: true,
    last_seen_at: now,
    updated_at: now,
  });
}

export function setLessonCompletion(lessonId: number, completed: boolean): LocalLessonProgress {
  const now = nowIso();
  return upsertLessonProgress(lessonId, {
    seen: true,
    completed,
    percent: completed ? 100 : 0,
    last_seen_at: now,
    updated_at: now,
  });
}

export function addLessonTime(
  lessonId: number,
  deltaMs: number,
  maxDeltaMs = DEFAULT_MAX_SESSION_MS
): LocalLessonProgress {
  const safeDelta = Math.min(Math.max(0, deltaMs), maxDeltaMs);
  const now = nowIso();
  return upsertLessonProgress(lessonId, {
    seen: true,
    time_ms_delta: safeDelta,
    last_seen_at: now,
    updated_at: now,
  });
}

export function getPendingLessons(): Record<string, LocalLessonProgress> {
  const state = readState();
  const out: Record<string, LocalLessonProgress> = {};
  for (const id of state.pending) {
    const progress = state.lessons[id];
    if (progress) out[id] = progress;
  }
  return out;
}

export function clearPendingIfUnchanged(sent: Record<string, LocalLessonProgress>): void {
  const state = readState();
  const pending = new Set(state.pending);
  let changed = false;

  for (const [id, sentProgress] of Object.entries(sent)) {
    if (!pending.has(id)) continue;
    const local = state.lessons[id];
    if (!local) {
      pending.delete(id);
      changed = true;
      continue;
    }
    if (!isAfter(local.updated_at, sentProgress.updated_at)) {
      pending.delete(id);
      changed = true;
    }
  }

  if (changed) {
    state.pending = Array.from(pending);
    writeState(state);
  }
}

export function mergeServerLessons(rows: LessonProgress[]): void {
  const state = readState();
  let changed = false;

  for (const row of rows) {
    const id = String(row.lesson_id);
    const local = state.lessons[id];
    if (!local || isAfter(row.updated_at, local.updated_at)) {
      state.lessons[id] = normalizeLesson({
        seen: row.seen,
        completed: row.completed,
        percent: row.percent,
        time_ms: row.time_ms,
        score_best: row.score_best,
        score_last: row.score_last,
        updated_at: row.updated_at,
        last_seen_at: row.last_seen_at,
      });
      changed = true;
      if (state.pending.includes(id)) {
        state.pending = state.pending.filter((p) => p !== id);
      }
    }
  }

  if (changed) {
    writeState(state);
  }
}

export function setLastSyncAt(value: string | null): void {
  const state = readState();
  state.last_sync_at = value;
  writeState(state);
}

export function exportProgressPayload(): {
  device_id: string;
  lessons: Record<string, LocalLessonProgress>;
} {
  const state = readState();
  return { device_id: state.device_id, lessons: getPendingLessons() };
}
