import { describe, expect, it } from 'vitest';
import {
  BLOCKED_INITIALS,
  GAME_IDS,
  MAX_ENTRIES,
  SCORE_CAPS,
  isAllowedInitials,
  isDifficulty,
  isGameId,
  qualifiesAgainst,
  sanitizeInitials,
  validateSubmission,
} from './validation';

const good = { initials: 'ABC', score: 100, difficulty: 'big-kids' };

describe('catalog constants', () => {
  it('has the 9 canonical game ids with a cap each', () => {
    expect(GAME_IDS).toHaveLength(9);
    expect(new Set(GAME_IDS).size).toBe(9);
    for (const id of GAME_IDS) {
      expect(SCORE_CAPS[id]).toBeGreaterThan(0);
    }
    expect(SCORE_CAPS).toEqual({
      'quiz-showdown': 50_000,
      'word-scramble': 20_000,
      jeopardy: 20_000,
      millionaire: 100_000,
      'scripture-cards': 10_000,
      'faith-fortress': 35_000,
      'promised-land': 10_000,
      survivors: 200_000,
      'kingdom-match': 5_000,
    });
  });

  it('ports the client blocklist verbatim (25 combos)', () => {
    expect(BLOCKED_INITIALS.size).toBe(25);
    expect([...BLOCKED_INITIALS].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('recognises game ids and difficulties', () => {
    expect(isGameId('survivors')).toBe(true);
    expect(isGameId('SURVIVORS')).toBe(false);
    expect(isGameId('not-a-game')).toBe(false);
    expect(isGameId(7)).toBe(false);
    expect(isDifficulty('little-kids')).toBe(true);
    expect(isDifficulty('big-kids')).toBe(true);
    expect(isDifficulty('medium')).toBe(false);
  });
});

describe('initials helpers', () => {
  it('sanitizes like the client store', () => {
    expect(sanitizeInitials('abc')).toBe('ABC');
    expect(sanitizeInitials('a')).toBe('AAA');
    expect(sanitizeInitials('')).toBe('AAA');
    expect(sanitizeInitials('a1b2c3d')).toBe('ABC');
    expect(sanitizeInitials('n i k')).toBe('NIK');
  });

  it('rejects every blocklisted combo case-insensitively', () => {
    for (const blocked of BLOCKED_INITIALS) {
      expect(isAllowedInitials(blocked)).toBe(false);
      expect(isAllowedInitials(blocked.toLowerCase())).toBe(false);
    }
    expect(isAllowedInitials('NIK')).toBe(true);
  });
});

describe('qualifiesAgainst', () => {
  const board = (scores: number[]) => scores.map((score) => ({ score }));

  it('accepts anything positive on a short board', () => {
    expect(qualifiesAgainst([], 1)).toBe(true);
    expect(qualifiesAgainst(board([900, 800]), 5)).toBe(true);
  });

  it('rejects non-positive and non-finite scores', () => {
    expect(qualifiesAgainst([], 0)).toBe(false);
    expect(qualifiesAgainst([], -5)).toBe(false);
    expect(qualifiesAgainst([], Number.NaN)).toBe(false);
    expect(qualifiesAgainst([], Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('needs to beat 10th place on a full board (ties do not qualify)', () => {
    const full = board([100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    expect(full).toHaveLength(MAX_ENTRIES);
    expect(qualifiesAgainst(full, 11)).toBe(true);
    expect(qualifiesAgainst(full, 10)).toBe(false);
    expect(qualifiesAgainst(full, 9)).toBe(false);
  });
});

describe('validateSubmission', () => {
  it('accepts a normal submission', () => {
    const result = validateSubmission('survivors', good);
    expect(result).toEqual({
      ok: true,
      gameId: 'survivors',
      value: { initials: 'ABC', score: 100, difficulty: 'big-kids' },
    });
  });

  it('uppercases lowercase initials', () => {
    const result = validateSubmission('survivors', { ...good, initials: 'nik' });
    expect(result.ok && result.value.initials).toBe('NIK');
  });

  it('rejects an unknown game id', () => {
    expect(validateSubmission('not-a-game', good)).toEqual({
      ok: false,
      error: 'Unknown game',
    });
    expect(validateSubmission(undefined, good).ok).toBe(false);
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, 'ABC', 42, [good], undefined]) {
      const result = validateSubmission('survivors', body);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBe(
        'Body must be a JSON object',
      );
    }
  });

  it('rejects initials that are not exactly 3 letters A-Z', () => {
    for (const initials of ['', 'AB', 'ABCD', 'A1C', 'A C', 'ÄBC', ' ABC']) {
      expect(validateSubmission('survivors', { ...good, initials }).ok).toBe(
        false,
      );
    }
    expect(validateSubmission('survivors', { ...good, initials: 7 }).ok).toBe(
      false,
    );
  });

  it('rejects every blocklisted combo, including lowercase', () => {
    for (const blocked of BLOCKED_INITIALS) {
      const upper = validateSubmission('survivors', {
        ...good,
        initials: blocked,
      });
      const lower = validateSubmission('survivors', {
        ...good,
        initials: blocked.toLowerCase(),
      });
      expect(upper.ok).toBe(false);
      expect(lower.ok).toBe(false);
      expect(upper.ok === false && upper.error).toBe(
        'Those initials are not allowed',
      );
    }
  });

  it('accepts a score exactly at the cap and rejects cap + 1', () => {
    for (const gameId of GAME_IDS) {
      const cap = SCORE_CAPS[gameId];
      expect(validateSubmission(gameId, { ...good, score: cap }).ok).toBe(true);
      const over = validateSubmission(gameId, { ...good, score: cap + 1 });
      expect(over.ok).toBe(false);
      expect(over.ok === false && over.error).toBe(
        `score must be at most ${cap}`,
      );
    }
  });

  it('rejects zero, negative, non-integer and non-numeric scores', () => {
    for (const score of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '10', null]) {
      const result = validateSubmission('survivors', { ...good, score });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBe(
        'score must be a positive integer',
      );
    }
  });

  it('rejects a bad difficulty', () => {
    for (const difficulty of ['medium', '', null, undefined, 1]) {
      const result = validateSubmission('survivors', { ...good, difficulty });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBe(
        'difficulty must be little-kids or big-kids',
      );
    }
  });

  it('ignores unexpected extra fields (nothing beyond the 3 is stored)', () => {
    const result = validateSubmission('survivors', {
      ...good,
      ts: 123,
      name: 'Nicholas',
      deviceId: 'abc',
    });
    expect(result.ok && Object.keys(result.value).sort()).toEqual([
      'difficulty',
      'initials',
      'score',
    ]);
  });
});
