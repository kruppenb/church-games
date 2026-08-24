/**
 * Weekly arcade leaderboard — the LOCAL/OFFLINE store (device-local, no accounts).
 *
 * This module is the synchronous localStorage implementation. It is used
 * directly when the shared API is not configured, and as the offline fallback
 * behind the async facade in `leaderboard-store.ts`.
 *
 * Boards are per-game (the games have incomparable scoring systems, see
 * score-store.ts) and per-week, where a "week" starts on Sunday to match the
 * church lesson cadence. The newest WEEKS_TO_KEEP weeks are retained so kids
 * can browse recent history; older weeks are pruned on write.
 *
 * Every read is defensive: missing, unavailable, or corrupt storage degrades
 * to an empty board rather than throwing.
 */

import type { Difficulty } from "@/hooks/useDifficulty";

export interface LeaderboardEntry {
  initials: string; // exactly 3 chars A–Z
  score: number; // integer >= 0
  difficulty: Difficulty;
  ts: number; // Date.now() at submission
  rowKey?: string; // present on API responses only (moderation handle)
}

/** gameId -> entries */
type WeekBoards = Record<string, LeaderboardEntry[]>;

/** Persisted shape: { version: 1, weeks: { [weekKey]: { [gameId]: entries } } } */
interface LeaderboardData {
  version: 1;
  weeks: Record<string, WeekBoards>;
}

export const MAX_ENTRIES = 10;
export const WEEKS_TO_KEEP = 6;

const STORAGE_KEY = "church-games:leaderboard";
const LAST_INITIALS_KEY = "church-games:last-initials";

/** Rude / unwanted 3-letter combos. Compared uppercase. */
const BLOCKED_INITIALS = new Set([
  "ASS",
  "SEX",
  "FUK",
  "FUC",
  "FCK",
  "FUX",
  "DIK",
  "DIC",
  "DCK",
  "CUM",
  "TIT",
  "FAG",
  "NIG",
  "KKK",
  "POO",
  "PEE",
  "BUT",
  "HEL",
  "DAM",
  "DMN",
  "VAG",
  "PNS",
  "WTF",
  "STD",
  "XXX",
]);

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isDifficulty(v: unknown): v is Difficulty {
  return v === "little-kids" || v === "big-kids";
}

/** Coerce one unknown value into a valid entry, or null if unusable. */
export function normalizeEntry(raw: unknown): LeaderboardEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.initials !== "string") return null;
  if (typeof r.score !== "number" || !Number.isFinite(r.score)) return null;
  if (!isDifficulty(r.difficulty)) return null;
  const ts = typeof r.ts === "number" && Number.isFinite(r.ts) ? r.ts : 0;
  const entry: LeaderboardEntry = {
    initials: sanitizeInitials(r.initials),
    score: Math.max(0, Math.floor(r.score)),
    difficulty: r.difficulty,
    ts,
  };
  if (typeof r.rowKey === "string") entry.rowKey = r.rowKey;
  return entry;
}

/** Score desc, ties broken by earlier ts (first to set the score holds it). */
export function compareEntries(
  a: LeaderboardEntry,
  b: LeaderboardEntry,
): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.ts - b.ts;
}

/** Load + normalize the whole store. Returns an empty store on any problem. */
function loadData(): LeaderboardData {
  const empty: LeaderboardData = { version: 1, weeks: {} };
  if (!isStorageAvailable()) return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return empty;
    }
    const weeksRaw = (parsed as Record<string, unknown>).weeks;
    if (
      typeof weeksRaw !== "object" ||
      weeksRaw === null ||
      Array.isArray(weeksRaw)
    ) {
      return empty;
    }

    const weeks: Record<string, WeekBoards> = {};
    for (const [weekKey, boardsRaw] of Object.entries(
      weeksRaw as Record<string, unknown>,
    )) {
      if (!WEEK_KEY_RE.test(weekKey)) continue;
      if (
        typeof boardsRaw !== "object" ||
        boardsRaw === null ||
        Array.isArray(boardsRaw)
      ) {
        continue;
      }
      const boards: WeekBoards = {};
      for (const [gameId, entriesRaw] of Object.entries(
        boardsRaw as Record<string, unknown>,
      )) {
        if (!Array.isArray(entriesRaw)) continue;
        const entries: LeaderboardEntry[] = [];
        for (const item of entriesRaw) {
          const entry = normalizeEntry(item);
          if (entry) entries.push(entry);
        }
        boards[gameId] = entries.sort(compareEntries).slice(0, MAX_ENTRIES);
      }
      weeks[weekKey] = boards;
    }
    return { version: 1, weeks };
  } catch {
    return empty;
  }
}

function saveData(data: LeaderboardData): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently degrade
  }
}

/**
 * Local-time date of the most recent Sunday (or `d` itself when `d` is Sunday),
 * formatted `YYYY-MM-DD`. Time-of-day is ignored.
 */
export function getWeekKey(d: Date = new Date()): string {
  const base = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  local.setDate(local.getDate() - local.getDay());
  return formatLocalDate(local);
}

/**
 * `"Week of Aug 23"` for the current year, `"Week of Aug 23, 2026"` otherwise.
 * The key is parsed as LOCAL date components — `new Date("YYYY-MM-DD")` is
 * parsed as UTC and shifts a day in negative-offset timezones.
 */
export function formatWeekLabel(weekKey: string): string {
  if (typeof weekKey !== "string" || !WEEK_KEY_RE.test(weekKey)) return weekKey;
  const [yStr, mStr, dStr] = weekKey.split("-");
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1;
  const day = Number(dStr);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return weekKey;

  const label = `Week of ${MONTH_NAMES[monthIndex]} ${day}`;
  const currentYear = new Date().getFullYear();
  return year === currentYear ? label : `${label}, ${year}`;
}

/** Week keys present in storage, newest first. */
export function listWeeks(): string[] {
  const { weeks } = loadData();
  return Object.keys(weeks).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** Board for one game in one week: score desc, ties earlier `ts` first. */
export function getBoard(weekKey: string, gameId: string): LeaderboardEntry[] {
  if (typeof weekKey !== "string" || typeof gameId !== "string") return [];
  const { weeks } = loadData();
  const board = weeks[weekKey]?.[gameId];
  if (!board) return [];
  return board.slice().sort(compareEntries).slice(0, MAX_ENTRIES);
}

/**
 * Every board stored for one week, keyed by gameId. `loadData` has already
 * sorted and trimmed each board. `{}` when the week is unknown or invalid.
 */
export function getWeekBoards(weekKey: string): Record<string, LeaderboardEntry[]> {
  if (typeof weekKey !== "string") return {};
  const { weeks } = loadData();
  return weeks[weekKey] ?? {};
}

/**
 * The pure arcade qualify rule against an already-sorted board.
 * A board that is full and tied at 10th place does NOT qualify.
 */
export function qualifiesAgainst(
  board: LeaderboardEntry[],
  score: number,
): boolean {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return false;
  }
  if (!Array.isArray(board) || board.length < MAX_ENTRIES) return true;
  return score > board[MAX_ENTRIES - 1].score;
}

/**
 * True when `score` earns a spot on this week's board for `gameId`.
 * Arcade rule: a board that is full and tied at 10th place does NOT qualify.
 */
export function qualifies(gameId: string, score: number): boolean {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return false;
  }
  return qualifiesAgainst(getBoard(getWeekKey(), gameId), score);
}

/** Uppercase, strip non-A–Z, pad with "A" / trim to exactly 3 chars. */
export function sanitizeInitials(raw: string): string {
  const letters = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return `${letters}AAA`.slice(0, 3);
}

/** False for blocklisted combos (case-insensitive). */
export function isAllowedInitials(s: string): boolean {
  const normalized = String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return !BLOCKED_INITIALS.has(normalized);
}

/** Last initials used on this device, sanitized — or null if never set. */
export function getLastInitials(): string | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(LAST_INITIALS_KEY);
    if (!raw) return null;
    const letters = raw.toUpperCase().replace(/[^A-Z]/g, "");
    if (!letters) return null;
    return sanitizeInitials(letters);
  } catch {
    return null;
  }
}

/** Remember the initials for next time (per-device prefill, always local). */
export function rememberInitials(initials: string): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(LAST_INITIALS_KEY, initials);
  } catch {
    // Silently degrade
  }
}

/**
 * Insert a score into the CURRENT week's board for `gameId`, trim to 10, prune
 * storage to the newest WEEKS_TO_KEEP weeks and save. Also remembers the
 * initials for next time.
 *
 * Returns the 1-based rank of the new entry, or -1 if it fell off the board.
 */
export function submitScore(
  gameId: string,
  entry: { initials: string; score: number; difficulty: Difficulty },
): number {
  const initials = sanitizeInitials(entry.initials);
  rememberInitials(initials);

  const rawScore = entry.score;
  const score =
    typeof rawScore === "number" && Number.isFinite(rawScore)
      ? Math.max(0, Math.floor(rawScore))
      : 0;

  const newEntry: LeaderboardEntry = {
    initials,
    score,
    difficulty: isDifficulty(entry.difficulty) ? entry.difficulty : "little-kids",
    ts: Date.now(),
  };

  const data = loadData();
  const weekKey = getWeekKey();
  const boards = data.weeks[weekKey] ?? {};
  const board = boards[gameId] ?? [];

  // Push last so a stable sort keeps existing equal-score entries ahead.
  const sorted = board.concat(newEntry).sort(compareEntries);
  const trimmed = sorted.slice(0, MAX_ENTRIES);

  boards[gameId] = trimmed;
  data.weeks[weekKey] = boards;

  // Prune to the newest WEEKS_TO_KEEP weeks, always keeping the current one.
  const ordered = Object.keys(data.weeks).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
  const kept = ordered.slice(0, WEEKS_TO_KEEP);
  if (!kept.includes(weekKey)) kept[kept.length - 1] = weekKey;
  const keptSet = new Set(kept);
  for (const key of ordered) {
    if (!keptSet.has(key)) delete data.weeks[key];
  }

  saveData(data);

  const index = trimmed.indexOf(newEntry);
  return index === -1 ? -1 : index + 1;
}

/** Wipe every stored leaderboard week. */
export function clearLeaderboard(): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently degrade
  }
}
