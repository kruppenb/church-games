import { describe, expect, it } from 'vitest';
import { LeaderboardService } from './leaderboard-service';
import { encodePartitionKey, encodeRowKey } from './row-key';
import { MemoryTableStore, type StoredEntity } from './table-store';
import {
  MAX_ENTRIES,
  WEEKS_TO_KEEP,
  type Difficulty,
  type Submission,
} from './validation';

const PACIFIC = 'America/Los_Angeles';
const WEEK = '2026-08-23';
const START = Date.parse('2026-08-23T18:00:00Z'); // Sun 11:00 Pacific
const GAME = 'survivors';

function row(
  weekKey: string,
  gameId: string,
  initials: string,
  score: number,
  ts: number,
  difficulty: Difficulty = 'big-kids',
): StoredEntity {
  return {
    partitionKey: encodePartitionKey(weekKey, gameId),
    rowKey: encodeRowKey(score, ts),
    initials,
    score,
    difficulty,
    ts: String(ts),
  };
}

function makeService(seed: StoredEntity[] = []) {
  const store = new MemoryTableStore(seed);
  let now = START;
  const service = new LeaderboardService({
    store,
    now: () => new Date(now),
    timeZone: PACIFIC,
  });
  return {
    store,
    service,
    tick(ms = 1) {
      now += ms;
    },
    setNow(ms: number) {
      now = ms;
    },
  };
}

const submit = (
  service: LeaderboardService,
  initials: string,
  score: number,
  difficulty: Difficulty = 'big-kids',
) => service.submitScore(GAME, { initials, score, difficulty });

describe('currentWeekKey', () => {
  it('uses the injected clock and timezone', () => {
    const { service, setNow } = makeService();
    expect(service.currentWeekKey()).toBe(WEEK);
    // Sat 2026-08-22 23:30 Pacific is still the previous week
    setNow(Date.parse('2026-08-23T06:30:00Z'));
    expect(service.currentWeekKey()).toBe('2026-08-16');
  });

  it('resolves "current" and passes explicit keys through', () => {
    const { service } = makeService();
    expect(service.resolveWeekKey('current')).toBe(WEEK);
    expect(service.resolveWeekKey('2026-01-04')).toBe('2026-01-04');
  });
});

describe('submitScore', () => {
  it('writes to the current week and reports rank 1 on an empty board', async () => {
    const { service, store } = makeService();
    const result = await submit(service, 'NIK', 500);

    expect(result.weekKey).toBe(WEEK);
    expect(result.rank).toBe(1);
    expect(result.board).toHaveLength(1);
    expect(result.board[0]).toMatchObject({
      initials: 'NIK',
      score: 500,
      difficulty: 'big-kids',
      ts: START,
    });
    expect(result.board[0].rowKey).toBe(encodeRowKey(500, START));

    const [stored] = store.snapshot();
    expect(stored.partitionKey).toBe(`${WEEK}_${GAME}`);
    expect(stored.ts).toBe(String(START)); // stored as a STRING
    expect(stored.score).toBe(500);
    expect(Object.keys(stored).sort()).toEqual([
      'difficulty',
      'initials',
      'partitionKey',
      'rowKey',
      'score',
      'ts',
    ]);
  });

  it('never trusts a client ts — the server clock wins', async () => {
    const { service } = makeService();
    const result = await service.submitScore(GAME, {
      initials: 'NIK',
      score: 500,
      difficulty: 'big-kids',
      ts: 1,
    } as unknown as Submission);
    expect(result.board[0].ts).toBe(START);
  });

  it('orders best-first and returns the new entry rank', async () => {
    const { service, tick } = makeService();
    await submit(service, 'AAA', 100);
    tick();
    await submit(service, 'BBB', 900);
    tick();
    const third = await submit(service, 'CCC', 500);

    expect(third.rank).toBe(2);
    expect(third.board.map((e) => e.initials)).toEqual(['BBB', 'CCC', 'AAA']);
    expect(third.board.map((e) => e.score)).toEqual([900, 500, 100]);
  });

  it('breaks equal scores by earlier timestamp', async () => {
    const { service, tick } = makeService();
    await submit(service, 'FST', 400);
    tick(1000);
    const second = await submit(service, 'SND', 400);

    expect(second.rank).toBe(2);
    expect(second.board.map((e) => e.initials)).toEqual(['FST', 'SND']);
    expect(second.board[0].ts).toBeLessThan(second.board[1].ts);
  });

  it('retries once at ts + 1 when the same score lands in the same millisecond', async () => {
    const { service, store } = makeService();
    const first = await submit(service, 'AAA', 400);
    const second = await submit(service, 'BBB', 400); // clock not advanced

    expect(first.board[0].rowKey).toBe(encodeRowKey(400, START));
    expect(second.board[1].rowKey).toBe(encodeRowKey(400, START + 1));
    expect(second.rank).toBe(2);
    expect(store.size).toBe(2);
    expect(store.createCount).toBe(2);
  });

  it('trims the board to 10 and drops the overflow entity', async () => {
    const { service, store, tick } = makeService();
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      await submit(service, 'AAA', 100 + i * 10);
      tick();
    }
    expect(store.size).toBe(MAX_ENTRIES);

    const result = await submit(service, 'TOP', 5000);
    expect(result.rank).toBe(1);
    expect(result.board).toHaveLength(MAX_ENTRIES);
    expect(store.size).toBe(MAX_ENTRIES);
    // The old 10th place (score 100) is gone from storage, not just the response
    expect(store.snapshot().some((e) => e.score === 100)).toBe(false);
    expect(result.board.at(-1)?.score).toBe(110);
  });

  it('inserts in the middle of a full board and trims the tail', async () => {
    const { service, store, tick } = makeService();
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      await submit(service, 'AAA', 1000 - i * 10);
      tick();
    }
    // Board is 1000, 990, ... 910; 955 lands between 960 and 950.
    const result = await submit(service, 'MID', 955);
    expect(result.rank).toBe(6);
    expect(result.board[5].initials).toBe('MID');
    expect(result.board.map((e) => e.score)).toEqual([
      1000, 990, 980, 970, 960, 955, 950, 940, 930, 920,
    ]);
    expect(result.board).toHaveLength(MAX_ENTRIES);
    expect(store.size).toBe(MAX_ENTRIES);
  });

  it('rejects a non-qualifying score with rank -1 and no write', async () => {
    const { service, store, tick } = makeService();
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      await submit(service, 'AAA', 1000 - i * 10);
      tick();
    }
    const before = store.snapshot();
    const createsBefore = store.createCount;

    const result = await submit(service, 'LOW', 5);
    expect(result.rank).toBe(-1);
    expect(result.weekKey).toBe(WEEK);
    expect(result.board).toHaveLength(MAX_ENTRIES);
    expect(store.createCount).toBe(createsBefore);
    expect(store.snapshot()).toEqual(before);
  });

  it('treats a tie with 10th place on a full board as non-qualifying', async () => {
    const { service, store, tick } = makeService();
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      await submit(service, 'AAA', 1000 - i * 10);
      tick();
    }
    const tenth = 1000 - (MAX_ENTRIES - 1) * 10;
    const tie = await submit(service, 'TIE', tenth);
    expect(tie.rank).toBe(-1);
    expect(store.size).toBe(MAX_ENTRIES);

    const beats = await submit(service, 'WIN', tenth + 1);
    expect(beats.rank).toBe(MAX_ENTRIES);
    expect(store.size).toBe(MAX_ENTRIES);
  });

  it('keeps boards independent per game and per week', async () => {
    const { service, setNow } = makeService();
    await submit(service, 'AAA', 100);
    await service.submitScore('quiz-showdown', {
      initials: 'QQQ',
      score: 50,
      difficulty: 'little-kids',
    });

    const thisWeek = await service.getWeekBoards('current');
    expect(Object.keys(thisWeek.boards).sort()).toEqual([
      'quiz-showdown',
      'survivors',
    ]);
    expect(thisWeek.boards[GAME]).toHaveLength(1);
    expect(thisWeek.boards['quiz-showdown'][0].difficulty).toBe('little-kids');

    setNow(Date.parse('2026-08-30T18:00:00Z'));
    const nextWeek = await service.getWeekBoards('current');
    expect(nextWeek.weekKey).toBe('2026-08-30');
    expect(nextWeek.boards).toEqual({});
  });
});

describe('getWeekBoards', () => {
  it('returns an empty map for an unknown week', async () => {
    const { service } = makeService();
    expect(await service.getWeekBoards('2020-01-05')).toEqual({
      weekKey: '2020-01-05',
      boards: {},
    });
  });

  it('hides weeks outside the newest 6 (lazy retention backstop)', async () => {
    const weeks = [
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
      '2026-07-12', // 7th newest -> outside retention
    ];
    const seed = weeks.map((week, i) =>
      row(week, GAME, 'AAA', 100 + i, START - i * 1000),
    );
    const { service } = makeService(seed);

    const retained = await service.getWeekBoards('2026-07-19');
    expect(retained.boards[GAME]).toHaveLength(1);

    const hidden = await service.getWeekBoards('2026-07-12');
    expect(hidden).toEqual({ weekKey: '2026-07-12', boards: {} });
  });

  it('caps each board at 10 even if storage holds more', async () => {
    const seed = Array.from({ length: 14 }, (_, i) =>
      row(WEEK, GAME, 'AAA', 1000 - i, START + i),
    );
    const { service } = makeService(seed);
    const { boards } = await service.getWeekBoards(WEEK);
    expect(boards[GAME]).toHaveLength(MAX_ENTRIES);
    expect(boards[GAME][0].score).toBe(1000);
    expect(boards[GAME][9].score).toBe(991);
  });

  it('skips entities with an unusable rowKey or initials', async () => {
    const { service } = makeService([
      row(WEEK, GAME, 'AAA', 500, START),
      { partitionKey: `${WEEK}_${GAME}`, rowKey: 'junk', initials: 'BBB' },
      { partitionKey: `${WEEK}_${GAME}`, rowKey: encodeRowKey(400, START + 1) },
    ]);
    const { boards } = await service.getWeekBoards(WEEK);
    expect(boards[GAME]).toHaveLength(1);
    expect(boards[GAME][0].initials).toBe('AAA');
  });

  it('decodes ts from the rowKey, not the stored property', async () => {
    const { service } = makeService([
      { ...row(WEEK, GAME, 'AAA', 500, START), ts: 'not-a-number' },
    ]);
    const { boards } = await service.getWeekBoards(WEEK);
    expect(boards[GAME][0].ts).toBe(START);
  });

  it('defaults an unrecognised stored difficulty to little-kids', async () => {
    const { service } = makeService([
      { ...row(WEEK, GAME, 'AAA', 500, START), difficulty: 'medium' },
    ]);
    const { boards } = await service.getWeekBoards(WEEK);
    expect(boards[GAME][0].difficulty).toBe('little-kids');
  });
});

describe('listRetainedWeeks', () => {
  it('is empty for an empty table', async () => {
    const { service } = makeService();
    expect(await service.listRetainedWeeks()).toEqual([]);
  });

  it('returns distinct weeks newest first, capped at 6', async () => {
    const weeks = [
      '2026-07-12',
      '2026-08-23',
      '2026-07-19',
      '2026-08-02',
      '2026-08-16',
      '2026-07-26',
      '2026-08-09',
    ];
    const seed = weeks.flatMap((week, i) => [
      row(week, GAME, 'AAA', 100 + i, START - i * 1000),
      row(week, 'jeopardy', 'BBB', 50 + i, START - i * 1000),
    ]);
    const { service } = makeService(seed);

    expect(await service.listStoredWeeks()).toEqual([
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
      '2026-07-12',
    ]);
    const retained = await service.listRetainedWeeks();
    expect(retained).toHaveLength(WEEKS_TO_KEEP);
    expect(retained).toEqual([
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
    ]);
  });
});

describe('deleteEntry', () => {
  it('deletes an existing entity', async () => {
    const seeded = row(WEEK, GAME, 'AAA', 500, START);
    const { service, store } = makeService([seeded]);
    expect(await service.deleteEntry(WEEK, GAME, seeded.rowKey)).toBe(true);
    expect(store.size).toBe(0);
  });

  it('reports false for a missing entity', async () => {
    const { service } = makeService([row(WEEK, GAME, 'AAA', 500, START)]);
    expect(
      await service.deleteEntry(WEEK, GAME, encodeRowKey(1, START)),
    ).toBe(false);
    expect(await service.deleteEntry('2020-01-05', GAME, encodeRowKey(500, START))).toBe(
      false,
    );
  });

  it('removes the entry from the board it was on', async () => {
    const seeded = [
      row(WEEK, GAME, 'BAD', 900, START),
      row(WEEK, GAME, 'OKY', 100, START + 1),
    ];
    const { service } = makeService(seeded);
    await service.deleteEntry(WEEK, GAME, seeded[0].rowKey);
    const { boards } = await service.getWeekBoards(WEEK);
    expect(boards[GAME].map((e) => e.initials)).toEqual(['OKY']);
  });
});

describe('pruneOldWeeks', () => {
  it('deletes every entity outside the newest 6 weeks', async () => {
    const weeks = [
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
      '2026-07-12',
      '2026-07-05',
    ];
    const seed = weeks.flatMap((week, i) => [
      row(week, GAME, 'AAA', 100 + i, START - i * 1000),
      row(week, 'jeopardy', 'BBB', 50 + i, START - i * 1000),
    ]);
    const { service, store } = makeService(seed);

    const deleted = await service.pruneOldWeeks();
    expect(deleted).toBe(4); // 2 weeks x 2 games
    expect(store.size).toBe(12);
    expect(await service.listStoredWeeks()).toEqual([
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
    ]);
  });

  it('is a no-op when nothing is old enough', async () => {
    const { service, store } = makeService([row(WEEK, GAME, 'AAA', 1, START)]);
    expect(await service.pruneOldWeeks()).toBe(0);
    expect(store.size).toBe(1);
    expect(store.removeCount).toBe(0);
  });

  it('is a no-op on an empty table', async () => {
    const { service } = makeService();
    expect(await service.pruneOldWeeks()).toBe(0);
  });

  it('makes a pruned week disappear from the weeks list', async () => {
    const weeks = [
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
      '2026-07-12',
    ];
    const { service } = makeService(
      weeks.map((week, i) => row(week, GAME, 'AAA', 100 + i, START - i * 1000)),
    );
    expect(await service.listStoredWeeks()).toContain('2026-07-12');
    await service.pruneOldWeeks();
    expect(await service.listStoredWeeks()).not.toContain('2026-07-12');
    expect(await service.listRetainedWeeks()).toHaveLength(WEEKS_TO_KEEP);
  });
});
