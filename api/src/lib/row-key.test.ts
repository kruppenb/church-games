import { describe, expect, it } from 'vitest';
import {
  ROW_KEY_RE,
  SCORE_BASE,
  decodePartitionKey,
  decodeRowKey,
  encodePartitionKey,
  encodeRowKey,
  isRowKey,
  weekKeyFromPartitionKey,
  weekPartitionFilter,
} from './row-key';

describe('encodeRowKey / decodeRowKey', () => {
  it('produces the documented shape', () => {
    expect(encodeRowKey(1234, 1_756_000_000_000)).toBe(
      '9998765_1756000000000',
    );
    expect(ROW_KEY_RE.test(encodeRowKey(1234, 1_756_000_000_000))).toBe(true);
  });

  it('round-trips score and ts', () => {
    const cases: [number, number][] = [
      [1, 1],
      [7, 1_756_000_000_000],
      [50_000, 1_756_123_456_789],
      [200_000, 1_700_000_000_000],
      [SCORE_BASE, 1_756_000_000_000],
    ];
    for (const [score, ts] of cases) {
      expect(decodeRowKey(encodeRowKey(score, ts))).toEqual({ score, ts });
    }
  });

  it('pads to 7 + 13 digits for small values', () => {
    const rowKey = encodeRowKey(SCORE_BASE, 5);
    expect(rowKey).toBe('0000000_0000000000005');
    expect(decodeRowKey(rowKey)).toEqual({ score: SCORE_BASE, ts: 5 });
  });

  it('clamps out-of-range inputs instead of breaking the key width', () => {
    expect(ROW_KEY_RE.test(encodeRowKey(-5, 1_756_000_000_000))).toBe(true);
    expect(decodeRowKey(encodeRowKey(-5, 1_756_000_000_000))?.score).toBe(0);
    expect(ROW_KEY_RE.test(encodeRowKey(99_999_999, 1_756_000_000_000))).toBe(
      true,
    );
    expect(ROW_KEY_RE.test(encodeRowKey(10, 99_999_999_999_999))).toBe(true);
  });

  it('rejects malformed row keys', () => {
    expect(decodeRowKey('nope')).toBeNull();
    expect(decodeRowKey('999876_1756000000000')).toBeNull(); // 6-digit score
    expect(decodeRowKey('9998765-1756000000000')).toBeNull();
    expect(decodeRowKey('')).toBeNull();
    expect(isRowKey(123)).toBe(false);
    expect(isRowKey('9998765_1756000000000')).toBe(true);
  });
});

describe('row key ordering', () => {
  it('sorts a higher score first', () => {
    const high = encodeRowKey(9000, 1_756_000_000_000);
    const low = encodeRowKey(100, 1_756_000_000_000);
    expect([low, high].sort()).toEqual([high, low]);
  });

  it('breaks equal scores by earlier timestamp', () => {
    const first = encodeRowKey(500, 1_756_000_000_000);
    const second = encodeRowKey(500, 1_756_000_000_001);
    expect([second, first].sort()).toEqual([first, second]);
  });

  it('yields a full best-first board from a plain ascending sort', () => {
    const scores = [10, 400, 75, 400, 3];
    const rows = scores.map((score, i) =>
      encodeRowKey(score, 1_756_000_000_000 + i),
    );
    const decoded = rows
      .slice()
      .sort()
      .map((r) => decodeRowKey(r)!);
    expect(decoded.map((d) => d.score)).toEqual([400, 400, 75, 10, 3]);
    // The two 400s keep insertion order (index 1 before index 3)
    expect(decoded[0].ts).toBeLessThan(decoded[1].ts);
  });
});

describe('partition keys', () => {
  it('encodes and decodes', () => {
    const pk = encodePartitionKey('2026-08-23', 'scripture-cards');
    expect(pk).toBe('2026-08-23_scripture-cards');
    expect(decodePartitionKey(pk)).toEqual({
      weekKey: '2026-08-23',
      gameId: 'scripture-cards',
    });
    expect(weekKeyFromPartitionKey(pk)).toBe('2026-08-23');
  });

  it('rejects malformed partition keys', () => {
    expect(decodePartitionKey('2026-8-23_quiz-showdown')).toBeNull();
    expect(decodePartitionKey('2026-08-23-quiz')).toBeNull();
    expect(decodePartitionKey('2026-08-23_')).toBeNull();
    expect(decodePartitionKey('')).toBeNull();
    expect(weekKeyFromPartitionKey('garbage')).toBeNull();
  });

  it('builds a week range filter whose bounds bracket exactly that week', () => {
    const filter = weekPartitionFilter('2026-08-23');
    expect(filter).toBe(
      "PartitionKey ge '2026-08-23_' and PartitionKey lt '2026-08-23`'",
    );

    const low = '2026-08-23_';
    const high = '2026-08-23`';
    const inside = ['2026-08-23_quiz-showdown', '2026-08-23_survivors'];
    const outside = ['2026-08-16_survivors', '2026-08-30_survivors'];
    for (const pk of inside) {
      expect(pk >= low && pk < high).toBe(true);
    }
    for (const pk of outside) {
      expect(pk >= low && pk < high).toBe(false);
    }
  });
});
