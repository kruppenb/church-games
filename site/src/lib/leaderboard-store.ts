/**
 * Weekly arcade leaderboard — the facade the UI talks to.
 *
 * Reads and writes go to the shared API when `VITE_LEADERBOARD_API` is set,
 * and fall back to the device-local store (`leaderboard-local.ts`) whenever the
 * API is unconfigured, unreachable, slow or broken. Every result carries a
 * `source` so the UI can show a small "offline" note when a board is only from
 * this device.
 *
 * This module NEVER throws and NEVER shows an error to a kid.
 */

import type { Difficulty } from "@/hooks/useDifficulty";
import * as localStore from "@/lib/leaderboard-local";
import type { LeaderboardEntry } from "@/lib/leaderboard-local";
import {
  LeaderboardApiError,
  fetchWeekBoards as apiFetchWeekBoards,
  fetchWeeks as apiFetchWeeks,
  isSharedLeaderboardConfigured,
  postScore as apiPostScore,
} from "@/lib/leaderboard-api";

/**
 * Where a board came from.
 * - "shared"  — the API answered
 * - "local"   — the API is not configured (dev / offline demo); no note shown
 * - "offline" — the API is configured but unreachable; device-local, note shown
 */
export type BoardSource = "shared" | "local" | "offline";

export interface SubmitResult {
  rank: number;
  weekKey: string;
  board: LeaderboardEntry[];
  source: BoardSource;
}

export interface WeekBoardsResult {
  weekKey: string;
  boards: Record<string, LeaderboardEntry[]>;
  source: BoardSource;
}

export interface WeeksResult {
  weeks: string[];
  currentWeekKey: string;
  source: BoardSource;
}

/** Resolve `"current"` (and junk) to this device's current week key. */
function resolveWeekKey(weekKey: string): string {
  if (typeof weekKey !== "string" || weekKey === "" || weekKey === "current") {
    return localStore.getWeekKey();
  }
  return weekKey;
}

function submitLocally(
  gameId: string,
  entry: { initials: string; score: number; difficulty: Difficulty },
  source: BoardSource,
): SubmitResult {
  const rank = localStore.submitScore(gameId, entry);
  const weekKey = localStore.getWeekKey();
  return { rank, weekKey, board: localStore.getBoard(weekKey, gameId), source };
}

/** True when `score` earns a spot on this week's board for `gameId`. */
export async function qualifies(
  gameId: string,
  score: number,
): Promise<boolean> {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return false;
  }
  if (!isSharedLeaderboardConfigured()) {
    return localStore.qualifies(gameId, score);
  }
  try {
    const { boards } = await apiFetchWeekBoards("current");
    return localStore.qualifiesAgainst(boards[gameId] ?? [], score);
  } catch {
    return localStore.qualifies(gameId, score);
  }
}

/**
 * Record a score for the CURRENT week. The initials are always remembered on
 * this device (prefill for next time) regardless of where the score lands.
 */
export async function submitScore(
  gameId: string,
  entry: { initials: string; score: number; difficulty: Difficulty },
): Promise<SubmitResult> {
  const initials = localStore.sanitizeInitials(entry.initials);
  localStore.rememberInitials(initials);
  const payload = {
    initials,
    score: entry.score,
    difficulty: entry.difficulty,
  };

  if (!isSharedLeaderboardConfigured()) {
    return submitLocally(gameId, payload, "local");
  }

  try {
    const res = await apiPostScore(gameId, payload);
    return { ...res, source: "shared" };
  } catch (err) {
    // 429 is NOT a rejection of the score itself — the whole classroom shares
    // one wifi IP, so a throttled kid should still get the offline experience
    // (score kept on this device) rather than "you didn't make the board".
    const rejected =
      err instanceof LeaderboardApiError &&
      err.kind === "http" &&
      typeof err.status === "number" &&
      err.status >= 400 &&
      err.status < 500 &&
      err.status !== 429;

    if (rejected) {
      // The server said no (cap, blocklist). Writing it locally would show
      // the kid a score the shared board does not have — just show the real
      // board instead.
      let weekKey = localStore.getWeekKey();
      let board: LeaderboardEntry[] = [];
      try {
        const current = await apiFetchWeekBoards("current");
        weekKey = current.weekKey;
        board = current.boards[gameId] ?? [];
      } catch {
        // Keep the local week guess and an empty board.
      }
      return { rank: -1, weekKey, board, source: "shared" };
    }

    return submitLocally(gameId, payload, "offline");
  }
}

/** Every game's board for one week. `weekKey` may be `"current"`. */
export async function getWeekBoards(
  weekKey: string,
): Promise<WeekBoardsResult> {
  const localKey = resolveWeekKey(weekKey);
  const localResult = (source: BoardSource): WeekBoardsResult => ({
    weekKey: localKey,
    boards: localStore.getWeekBoards(localKey),
    source,
  });

  if (!isSharedLeaderboardConfigured()) return localResult("local");
  try {
    const res = await apiFetchWeekBoards(weekKey);
    return { ...res, source: "shared" };
  } catch {
    return localResult("offline");
  }
}

/** Retained week keys, newest first, plus the authoritative current week. */
export async function listWeeks(): Promise<WeeksResult> {
  const localResult = (source: BoardSource): WeeksResult => ({
    weeks: localStore.listWeeks(),
    currentWeekKey: localStore.getWeekKey(),
    source,
  });

  if (!isSharedLeaderboardConfigured()) return localResult("local");
  try {
    const res = await apiFetchWeeks();
    return { ...res, source: "shared" };
  } catch {
    return localResult("offline");
  }
}

export {
  MAX_ENTRIES,
  WEEKS_TO_KEEP,
  getWeekKey,
  formatWeekLabel,
  sanitizeInitials,
  isAllowedInitials,
  getLastInitials,
  clearLeaderboard,
  type LeaderboardEntry,
} from "@/lib/leaderboard-local";
export { isSharedLeaderboardConfigured } from "@/lib/leaderboard-api";
