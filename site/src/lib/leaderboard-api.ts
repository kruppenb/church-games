/**
 * Shared leaderboard — HTTP client for the Azure Functions API.
 *
 * This module is a thin, strict fetch wrapper: it knows the wire format and
 * nothing else. It has NO fallback logic and it always rejects with a
 * `LeaderboardApiError` — deciding what to do about a failure (local store,
 * offline note, silence) is the facade's job (`leaderboard-store.ts`).
 */

import type { Difficulty } from "@/hooks/useDifficulty";
import { normalizeEntry, type LeaderboardEntry } from "@/lib/leaderboard-local";

/** Every request is abandoned after this long — kids should never wait. */
export const API_TIMEOUT_MS = 3000;

export type ApiErrorKind =
  | "unconfigured"
  | "network"
  | "timeout"
  | "http"
  | "parse";

export class LeaderboardApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "LeaderboardApiError";
    this.kind = kind;
    if (typeof status === "number") this.status = status;
  }
}

export interface WeeksResponse {
  weeks: string[];
  currentWeekKey: string;
}

export interface WeekBoardsResponse {
  weekKey: string;
  boards: Record<string, LeaderboardEntry[]>;
}

export interface SubmitResponse {
  rank: number;
  weekKey: string;
  board: LeaderboardEntry[];
}

const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Base URL of the shared API (e.g. `https://…/api`), or null in pure-local mode.
 * Read lazily so build-time env stubbing (and tests) take effect.
 */
export function getApiBaseUrl(): string | null {
  // Read inside the function (not at module scope) so build-time replacement
  // and test-time `vi.stubEnv` both work.
  const raw: unknown = import.meta.env.VITE_LEADERBOARD_API;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed === "" ? null : trimmed;
}

export function isSharedLeaderboardConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

function parseFail(what: string): never {
  throw new LeaderboardApiError("parse", `Unexpected response shape: ${what}`);
}

function asObject(json: unknown, what: string): Record<string, unknown> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    parseFail(what);
  }
  return json as Record<string, unknown>;
}

function asWeekKey(value: unknown, what: string): string {
  if (typeof value !== "string" || !WEEK_KEY_RE.test(value)) parseFail(what);
  return value;
}

/** Normalize an array of wire entries, dropping any that are unusable. */
function toEntries(raw: unknown, what: string): LeaderboardEntry[] {
  if (!Array.isArray(raw)) parseFail(what);
  const entries: LeaderboardEntry[] = [];
  for (const item of raw) {
    const entry = normalizeEntry(item);
    if (entry) entries.push(entry);
  }
  return entries;
}

function toBoards(raw: unknown): Record<string, LeaderboardEntry[]> {
  const obj = asObject(raw, "boards");
  const boards: Record<string, LeaderboardEntry[]> = {};
  for (const [gameId, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) continue;
    boards[gameId] = toEntries(value, `boards.${gameId}`);
  }
  return boards;
}

/**
 * One request: abort after API_TIMEOUT_MS, map every failure mode onto a
 * `LeaderboardApiError`, and hand the decoded JSON to `parse`.
 */
async function request<T>(
  path: string,
  init: RequestInit,
  parse: (json: unknown) => T,
): Promise<T> {
  const base = getApiBaseUrl();
  if (base === null) {
    throw new LeaderboardApiError(
      "unconfigured",
      "Shared leaderboard is not configured (VITE_LEADERBOARD_API is unset)",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Accept: "application/json", ...(init.headers ?? {}) },
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new LeaderboardApiError("timeout", `Timed out after ${API_TIMEOUT_MS}ms`);
      }
      throw new LeaderboardApiError(
        "network",
        err instanceof Error ? err.message : "Network request failed",
      );
    }

    if (!res.ok) {
      throw new LeaderboardApiError("http", `HTTP ${res.status}`, res.status);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      if (controller.signal.aborted) {
        throw new LeaderboardApiError("timeout", `Timed out after ${API_TIMEOUT_MS}ms`);
      }
      throw new LeaderboardApiError("parse", "Response was not valid JSON");
    }

    return parse(json);
  } finally {
    clearTimeout(timer);
  }
}

/** `GET /weeks` — stored week keys (newest first) + the server's current week. */
export function fetchWeeks(): Promise<WeeksResponse> {
  return request("/weeks", { method: "GET" }, (json) => {
    const obj = asObject(json, "weeks response");
    if (!Array.isArray(obj.weeks)) parseFail("weeks");
    const weeks = obj.weeks.filter(
      (w): w is string => typeof w === "string" && WEEK_KEY_RE.test(w),
    );
    return {
      weeks,
      currentWeekKey: asWeekKey(obj.currentWeekKey, "currentWeekKey"),
    };
  });
}

/** `GET /board/{weekKey}` — `weekKey` may be `"current"`. */
export function fetchWeekBoards(weekKey: string): Promise<WeekBoardsResponse> {
  const key = typeof weekKey === "string" && weekKey !== "" ? weekKey : "current";
  return request(
    `/board/${encodeURIComponent(key)}`,
    { method: "GET" },
    (json) => {
      const obj = asObject(json, "board response");
      return {
        weekKey: asWeekKey(obj.weekKey, "weekKey"),
        boards: toBoards(obj.boards),
      };
    },
  );
}

/** `POST /score/{gameId}` — the server owns the week, the ts and the ranking. */
export function postScore(
  gameId: string,
  entry: { initials: string; score: number; difficulty: Difficulty },
): Promise<SubmitResponse> {
  return request(
    `/score/${encodeURIComponent(gameId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initials: entry.initials,
        score: entry.score,
        difficulty: entry.difficulty,
      }),
    },
    (json) => {
      const obj = asObject(json, "score response");
      if (typeof obj.rank !== "number" || !Number.isFinite(obj.rank)) {
        parseFail("rank");
      }
      return {
        rank: obj.rank,
        weekKey: asWeekKey(obj.weekKey, "weekKey"),
        board: toEntries(obj.board, "board"),
      };
    },
  );
}
