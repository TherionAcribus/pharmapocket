import { fetchLessonProgress, importLessonProgress } from "@/lib/api";
import {
  clearPendingIfUnchanged,
  exportProgressPayload,
  getLocalProgressState,
  mergeServerLessons,
  setLastSyncAt,
} from "@/lib/progressStore";

let syncEnabled = false;
let syncInFlight = false;
let syncScheduled: number | null = null;
let loopStarted = false;

function canSync(): boolean {
  if (!syncEnabled) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  return true;
}

export function setProgressSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
  if (enabled) scheduleProgressSync("enable");
}

export function scheduleProgressSync(reason: string): void {
  if (!canSync()) return;
  if (syncScheduled !== null) return;
  if (typeof window === "undefined") return;
  syncScheduled = window.setTimeout(() => {
    syncScheduled = null;
    void syncProgress(reason);
  }, 1500);
}

export async function syncProgress(reason: string): Promise<void> {
  if (!canSync()) return;
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const payload = exportProgressPayload();
    const pendingCount = Object.keys(payload.lessons).length;
    if (pendingCount) {
      await importLessonProgress({
        device_id: payload.device_id,
        lessons: payload.lessons,
      });
      clearPendingIfUnchanged(payload.lessons);
    }

    const serverRows = await fetchLessonProgress();
    mergeServerLessons(serverRows);
    setLastSyncAt(new Date().toISOString());
  } catch {
    // keep pending entries for next sync attempt
  } finally {
    syncInFlight = false;
  }
}

export function ensureProgressSyncLoop(): void {
  if (typeof window === "undefined") return;
  if (loopStarted) return;
  loopStarted = true;

  const onOnline = () => scheduleProgressSync("online");
  const onVisibility = () => {
    if (document.visibilityState === "visible") scheduleProgressSync("visible");
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);

  window.setInterval(() => {
    const state = getLocalProgressState();
    if (state.pending.length) {
      scheduleProgressSync("interval");
    }
  }, 5 * 60 * 1000);

  scheduleProgressSync("startup");
}
