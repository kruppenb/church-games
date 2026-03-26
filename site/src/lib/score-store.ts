/**
 * Persists best star ratings per game in localStorage.
 * Stars-only (no numeric scores) since games have incomparable scoring systems.
 */

export interface GameRecord {
  bestStars: number; // 0-3
}

export type ScoreMap = Record<string, GameRecord>;

const STORAGE_KEY = "church-games:progress";

function isStorageAvailable(): boolean {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, "1");
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/** Load all game records. Returns empty object if unavailable or corrupt. */
export function loadAllScores(): ScoreMap {
  if (!isStorageAvailable()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as ScoreMap;
  } catch {
    return {};
  }
}

/** Load record for a single game. Returns null if no record. */
export function loadScore(gameId: string): GameRecord | null {
  const all = loadAllScores();
  return all[gameId] ?? null;
}

/**
 * Save a game result. Only updates if stars improve on existing best.
 * Returns the updated GameRecord.
 */
export function saveScore(gameId: string, stars: number): GameRecord {
  if (!isStorageAvailable()) return { bestStars: stars };

  const all = loadAllScores();
  const existing = all[gameId];
  const bestStars = Math.max(existing?.bestStars ?? 0, stars);

  const record: GameRecord = { bestStars };
  all[gameId] = record;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable — silently degrade
  }

  return record;
}

/** Reset all saved progress. */
export function resetAllScores(): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently degrade
  }
}
