/**
 * Server-side validation. The client's checks are UX only — with a shared board
 * a bypassed client would show rude initials or a fabricated score to every kid
 * in the class, so everything is re-checked here.
 *
 * `BLOCKED_INITIALS` is ported verbatim from
 * `site/src/lib/leaderboard-store.ts` (lines 38-64) and must stay in sync.
 */

export const GAME_IDS = [
  'quiz-showdown',
  'word-scramble',
  'faith-fortress',
  'promised-land',
  'millionaire',
  'survivors',
  'jeopardy',
  'scripture-cards',
  'kingdom-match',
] as const;

export type GameId = (typeof GAME_IDS)[number];

/** Per-game sanity caps — anti-cheat beyond this is explicitly out of scope. */
export const SCORE_CAPS: Record<GameId, number> = {
  'quiz-showdown': 50_000,
  'word-scramble': 20_000,
  jeopardy: 20_000,
  millionaire: 100_000,
  'scripture-cards': 10_000,
  'faith-fortress': 35_000,
  'promised-land': 10_000,
  survivors: 200_000,
  'kingdom-match': 5_000,
};

export const DIFFICULTIES = ['little-kids', 'big-kids'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Rude / unwanted 3-letter combos. Compared uppercase. */
export const BLOCKED_INITIALS = new Set([
  'ASS',
  'SEX',
  'FUK',
  'FUC',
  'FCK',
  'FUX',
  'DIK',
  'DIC',
  'DCK',
  'CUM',
  'TIT',
  'FAG',
  'NIG',
  'KKK',
  'POO',
  'PEE',
  'BUT',
  'HEL',
  'DAM',
  'DMN',
  'VAG',
  'PNS',
  'WTF',
  'STD',
  'XXX',
]);

export const MAX_ENTRIES = 10;
export const WEEKS_TO_KEEP = 6;

const INITIALS_RE = /^[A-Z]{3}$/;

export function isGameId(value: unknown): value is GameId {
  return (
    typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value)
  );
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'little-kids' || value === 'big-kids';
}

/** Uppercase, strip non-A-Z, pad with "A" / trim to exactly 3 chars. */
export function sanitizeInitials(raw: string): string {
  const letters = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return `${letters}AAA`.slice(0, 3);
}

/** False for blocklisted combos (case-insensitive). */
export function isAllowedInitials(value: string): boolean {
  const normalized = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return !BLOCKED_INITIALS.has(normalized);
}

/**
 * The arcade qualify rule, shared with the client:
 * a full board tied at 10th place does NOT qualify, and `score <= 0` never does.
 */
export function qualifiesAgainst(
  board: readonly { score: number }[],
  score: number,
): boolean {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return false;
  }
  if (board.length < MAX_ENTRIES) return true;
  return score > board[MAX_ENTRIES - 1].score;
}

export interface Submission {
  initials: string;
  score: number;
  difficulty: Difficulty;
}

export type ValidationResult =
  | { ok: true; gameId: GameId; value: Submission }
  | { ok: false; error: string };

/**
 * Validate `POST /api/score/{gameId}`. Every failure is a 400 with a short,
 * non-leaky message.
 */
export function validateSubmission(
  gameId: unknown,
  body: unknown,
): ValidationResult {
  if (!isGameId(gameId)) {
    return { ok: false, error: 'Unknown game' };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.initials !== 'string') {
    return { ok: false, error: 'initials must be a string' };
  }
  const initials = raw.initials.toUpperCase();
  if (!INITIALS_RE.test(initials)) {
    return { ok: false, error: 'initials must be exactly 3 letters A-Z' };
  }
  if (!isAllowedInitials(initials)) {
    return { ok: false, error: 'Those initials are not allowed' };
  }

  const score = raw.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score <= 0) {
    return { ok: false, error: 'score must be a positive integer' };
  }
  const cap = SCORE_CAPS[gameId];
  if (score > cap) {
    return { ok: false, error: `score must be at most ${cap}` };
  }

  if (!isDifficulty(raw.difficulty)) {
    return { ok: false, error: 'difficulty must be little-kids or big-kids' };
  }

  return {
    ok: true,
    gameId,
    value: { initials, score, difficulty: raw.difficulty },
  };
}
