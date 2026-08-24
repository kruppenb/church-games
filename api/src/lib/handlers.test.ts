import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_FAILURE_MAX,
  AUTH_THROTTLE_WINDOW_MS,
  resetAuthThrottle,
} from './auth-throttle';
import { parseAllowedOrigins } from './cors';
import {
  createHandlers,
  type HandlerRequest,
  type Handlers,
} from './handlers';
import { encodePartitionKey, encodeRowKey } from './row-key';
import { RATE_LIMIT_MAX, resetRateLimit } from './rate-limit';
import { MemoryTableStore, type StoredEntity } from './table-store';
import { MAX_ENTRIES } from './validation';

const PACIFIC = 'America/Los_Angeles';
const WEEK = '2026-08-23';
const START = Date.parse('2026-08-23T18:00:00Z');
const ALLOWED_ORIGIN = 'https://kruppenb.github.io';
const MOD_KEY = 'super-secret';

function seedRow(
  weekKey: string,
  gameId: string,
  initials: string,
  score: number,
  ts: number,
): StoredEntity {
  return {
    partitionKey: encodePartitionKey(weekKey, gameId),
    rowKey: encodeRowKey(score, ts),
    initials,
    score,
    difficulty: 'big-kids',
    ts: String(ts),
  };
}

interface FakeRequestInit {
  method?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  /** Simulate an unparseable body. */
  badJson?: boolean;
}

function request(init: FakeRequestInit = {}): HandlerRequest {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method: init.method ?? 'GET',
    headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    params: init.params ?? {},
    json: async () => {
      if (init.badJson) throw new SyntaxError('Unexpected token');
      return init.body;
    },
  };
}

function setup(
  seed: StoredEntity[] = [],
  moderationKey?: string,
  rateLimitPerMinute?: number,
  authFailuresPer15Min?: number,
) {
  const store = new MemoryTableStore(seed);
  let now = START;
  const handlers: Handlers = createHandlers({
    store,
    now: () => new Date(now),
    timeZone: PACIFIC,
    moderationKey,
    allowedOrigins: parseAllowedOrigins(undefined),
    rateLimitPerMinute,
    authFailuresPer15Min,
  });
  return {
    store,
    handlers,
    setNow(ms: number) {
      now = ms;
    },
  };
}

const body = (res: { jsonBody?: unknown }) => res.jsonBody as never;
const header = (res: { headers?: unknown }, name: string) =>
  (res.headers as Record<string, string> | undefined)?.[name];

beforeEach(() => {
  resetRateLimit();
  resetAuthThrottle();
});

describe('GET /weeks', () => {
  it('returns retained weeks newest-first plus the server week key', async () => {
    const weeks = [
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
      '2026-07-12',
    ];
    const { handlers } = setup(
      weeks.map((w, i) => seedRow(w, 'survivors', 'AAA', 100 + i, START - i)),
    );
    const res = await handlers.weeks(request());

    expect(res.status).toBe(200);
    expect(body(res)).toEqual({
      weeks: [
        '2026-08-23',
        '2026-08-16',
        '2026-08-09',
        '2026-08-02',
        '2026-07-26',
        '2026-07-19',
      ],
      currentWeekKey: WEEK,
    });
  });

  it('works on an empty table', async () => {
    const { handlers } = setup();
    const res = await handlers.weeks(request());
    expect(body(res)).toEqual({ weeks: [], currentWeekKey: WEEK });
  });

  it('always sets Cache-Control: no-store', async () => {
    const { handlers } = setup();
    const res = await handlers.weeks(request());
    expect(header(res, 'Cache-Control')).toBe('no-store');
  });

  it('returns 500 (not a throw) when storage fails', async () => {
    const { handlers } = setup();
    const error = vi.fn();
    vi.spyOn(handlers.service, 'listRetainedWeeks').mockRejectedValue(
      new Error('storage down'),
    );
    const res = await handlers.weeks(request(), {
      log: vi.fn(),
      warn: vi.fn(),
      error,
    });
    expect(res.status).toBe(500);
    expect(body(res)).toEqual({ error: 'Leaderboard unavailable' });
    expect(error).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('GET /board/{weekKey}', () => {
  it('resolves "current" to the server week', async () => {
    const { handlers } = setup([
      seedRow(WEEK, 'survivors', 'NIK', 500, START),
    ]);
    const res = await handlers.board(request({ params: { weekKey: 'current' } }));
    expect(res.status).toBe(200);
    const payload = body(res) as unknown as {
      weekKey: string;
      boards: Record<string, { initials: string; rowKey: string }[]>;
    };
    expect(payload.weekKey).toBe(WEEK);
    expect(payload.boards.survivors[0].initials).toBe('NIK');
    expect(payload.boards.survivors[0].rowKey).toBe(encodeRowKey(500, START));
  });

  it('accepts an explicit week key', async () => {
    const { handlers } = setup([
      seedRow(WEEK, 'survivors', 'NIK', 500, START),
      seedRow('2026-08-16', 'jeopardy', 'OLD', 10, START - 700_000_000),
    ]);
    const res = await handlers.board(request({ params: { weekKey: '2026-08-16' } }));
    const payload = body(res) as unknown as {
      weekKey: string;
      boards: Record<string, unknown[]>;
    };
    expect(payload.weekKey).toBe('2026-08-16');
    expect(Object.keys(payload.boards)).toEqual(['jeopardy']);
  });

  it('400s on a malformed week key', async () => {
    const { handlers } = setup();
    for (const weekKey of ['2026-8-23', 'last-week', '', '../../etc', "x' or '1'='1"]) {
      const res = await handlers.board(request({ params: { weekKey } }));
      expect(res.status).toBe(400);
      expect(body(res)).toEqual({ error: 'Invalid week' });
    }
  });

  it('returns empty boards for an unknown week', async () => {
    const { handlers } = setup([seedRow(WEEK, 'survivors', 'NIK', 500, START)]);
    const res = await handlers.board(request({ params: { weekKey: '2020-01-05' } }));
    expect(res.status).toBe(200);
    expect(body(res)).toEqual({ weekKey: '2020-01-05', boards: {} });
  });
});

describe('POST /score/{gameId}', () => {
  const post = (gameId: string, payload: unknown, headers?: Record<string, string>) =>
    request({
      method: 'POST',
      params: { gameId },
      body: payload,
      headers,
    });

  it('accepts a valid submission and returns rank + board', async () => {
    const { handlers, store } = setup();
    const res = await handlers.score(
      post('survivors', {
        initials: 'nik',
        score: 1200,
        difficulty: 'big-kids',
      }),
    );
    expect(res.status).toBe(200);
    const payload = body(res) as unknown as {
      rank: number;
      weekKey: string;
      board: { initials: string; ts: number; rowKey: string }[];
    };
    expect(payload).toMatchObject({ rank: 1, weekKey: WEEK });
    expect(payload.board[0].initials).toBe('NIK');
    expect(payload.board[0].ts).toBe(START);
    expect(store.size).toBe(1);
  });

  it('400s on rude initials without writing', async () => {
    const { handlers, store } = setup();
    const res = await handlers.score(
      post('survivors', { initials: 'ass', score: 10, difficulty: 'big-kids' }),
    );
    expect(res.status).toBe(400);
    expect(body(res)).toEqual({ error: 'Those initials are not allowed' });
    expect(store.size).toBe(0);
  });

  it('400s above the per-game cap and accepts the cap exactly', async () => {
    const { handlers } = setup();
    const over = await handlers.score(
      post('survivors', { initials: 'NIK', score: 200_001, difficulty: 'big-kids' }),
    );
    expect(over.status).toBe(400);
    const at = await handlers.score(
      post('survivors', { initials: 'NIK', score: 200_000, difficulty: 'big-kids' }),
    );
    expect(at.status).toBe(200);
  });

  it('400s on an unknown game, bad score and bad difficulty', async () => {
    const { handlers } = setup();
    const good = { initials: 'NIK', score: 10, difficulty: 'big-kids' };
    expect((await handlers.score(post('nope', good))).status).toBe(400);
    expect(
      (await handlers.score(post('survivors', { ...good, score: 0 }))).status,
    ).toBe(400);
    expect(
      (await handlers.score(post('survivors', { ...good, difficulty: 'hard' })))
        .status,
    ).toBe(400);
  });

  it('400s on an unparseable body', async () => {
    const { handlers } = setup();
    const res = await handlers.score(
      request({ method: 'POST', params: { gameId: 'survivors' }, badJson: true }),
    );
    expect(res.status).toBe(400);
    expect(body(res)).toEqual({ error: 'Body must be a JSON object' });
  });

  it('returns rank -1 for a non-qualifying score', async () => {
    const seed = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      seedRow(WEEK, 'survivors', 'AAA', 1000 - i, START + i),
    );
    const { handlers, store } = setup(seed);
    const res = await handlers.score(
      post('survivors', { initials: 'LOW', score: 5, difficulty: 'big-kids' }),
    );
    expect(res.status).toBe(200);
    expect(body(res)).toMatchObject({ rank: -1, weekKey: WEEK });
    expect(store.size).toBe(MAX_ENTRIES);
  });

  it('429s the 31st submission in a minute with Retry-After', async () => {
    const { handlers } = setup();
    const payload = { initials: 'NIK', score: 10, difficulty: 'big-kids' };
    const headers = { 'x-forwarded-for': '203.0.113.9:5555' };
    expect(RATE_LIMIT_MAX).toBe(30);
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      // Distinct scores so each write gets its own rowKey at the pinned clock.
      const ok = await handlers.score(
        post('survivors', { ...payload, score: 10 + i }, headers),
      );
      expect(ok.status).toBe(200);
    }
    const limited = await handlers.score(post('survivors', payload, headers));
    expect(limited.status).toBe(429);
    expect(Number(header(limited, 'Retry-After'))).toBeGreaterThan(0);
    expect(header(limited, 'Cache-Control')).toBe('no-store');

    // A different IP is unaffected.
    const other = await handlers.score(
      post('survivors', payload, { 'x-forwarded-for': '198.51.100.7' }),
    );
    expect(other.status).toBe(200);
  });

  it('honours a configured LEADERBOARD_RATE_LIMIT_PER_MINUTE', async () => {
    const { handlers } = setup([], undefined, 3);
    const headers = { 'x-forwarded-for': '203.0.113.11' };
    const payload = { initials: 'NIK', score: 10, difficulty: 'big-kids' };
    for (let i = 0; i < 3; i += 1) {
      const ok = await handlers.score(
        post('survivors', { ...payload, score: 10 + i }, headers),
      );
      expect(ok.status).toBe(200);
    }
    const limited = await handlers.score(post('survivors', payload, headers));
    expect(limited.status).toBe(429);
  });

  it('does not 429 a classroom whose rejected POSTs also spend budget', async () => {
    // Regression: one NATed IP, 8 validation-rejected POSTs then valid ones.
    const { handlers } = setup();
    const headers = { 'x-forwarded-for': '203.0.113.42' };
    for (let i = 0; i < 8; i += 1) {
      const rejected = await handlers.score(
        post('survivors', { initials: 'ASS', score: 10, difficulty: 'big-kids' }, headers),
      );
      expect(rejected.status).toBe(400);
    }
    for (let i = 0; i < 11; i += 1) {
      const ok = await handlers.score(
        post(
          'survivors',
          { initials: 'NIK', score: 100 + i, difficulty: 'big-kids' },
          headers,
        ),
      );
      expect(ok.status).toBe(200);
    }
  });
});

describe('GET /moderation/check', () => {
  const check = (key?: string, extraHeaders: Record<string, string> = {}) =>
    request({
      method: 'GET',
      headers:
        key === undefined
          ? extraHeaders
          : { 'x-moderation-key': key, ...extraHeaders },
    });

  const GUESSER = { 'x-forwarded-for': '203.0.113.50' };

  it('204s with the right passphrase and returns no body', async () => {
    const { handlers } = setup([], MOD_KEY);
    const res = await handlers.check(check(MOD_KEY));
    expect(res.status).toBe(204);
    expect(res.jsonBody).toBeUndefined();
    expect(header(res, 'Cache-Control')).toBe('no-store');
  });

  it('401s on a wrong or missing passphrase', async () => {
    const { handlers } = setup([], MOD_KEY);
    const wrong = await handlers.check(check('nope'));
    expect(wrong.status).toBe(401);
    expect(body(wrong)).toEqual({ error: 'Unauthorized' });
    const missing = await handlers.check(check());
    expect(missing.status).toBe(401);
    expect(body(missing)).toEqual({ error: 'Unauthorized' });
  });

  it('401s when MODERATION_KEY is unset — never leaks that it is unconfigured', async () => {
    const { handlers } = setup([], undefined);
    const res = await handlers.check(check('anything'));
    expect(res.status).toBe(401);
    expect(body(res)).toEqual({ error: 'Unauthorized' });
  });

  it('never touches storage', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'AAA', 900, START);
    const { handlers, store } = setup([seeded], MOD_KEY);
    expect((await handlers.check(check(MOD_KEY))).status).toBe(204);
    expect((await handlers.check(check('nope'))).status).toBe(401);
    expect(store.size).toBe(1);
  });

  it('429s the 11th try from one IP, even with the right passphrase', async () => {
    const { handlers } = setup([], MOD_KEY);
    expect(AUTH_FAILURE_MAX).toBe(10);
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      const wrong = await handlers.check(check('guess', GUESSER));
      expect(wrong.status).toBe(401);
    }
    const limited = await handlers.check(check(MOD_KEY, GUESSER));
    expect(limited.status).toBe(429);
    expect(body(limited)).toEqual({
      error: 'Too many wrong passphrases — try again later',
    });
    expect(Number(header(limited, 'Retry-After'))).toBe(900);
    expect(header(limited, 'Cache-Control')).toBe('no-store');

    // A teacher on a different IP is unaffected.
    const other = await handlers.check(
      check(MOD_KEY, { 'x-forwarded-for': '198.51.100.7' }),
    );
    expect(other.status).toBe(204);
  });

  it('un-throttles once the window has passed', async () => {
    const { handlers, setNow } = setup([], MOD_KEY);
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      await handlers.check(check('guess', GUESSER));
    }
    expect((await handlers.check(check(MOD_KEY, GUESSER))).status).toBe(429);
    setNow(START + AUTH_THROTTLE_WINDOW_MS + 1);
    expect((await handlers.check(check(MOD_KEY, GUESSER))).status).toBe(204);
  });

  it('honours a configured LEADERBOARD_AUTH_FAILURES_PER_15MIN', async () => {
    const { handlers } = setup([], MOD_KEY, undefined, 3);
    for (let i = 0; i < 3; i += 1) {
      expect((await handlers.check(check('guess', GUESSER))).status).toBe(401);
    }
    expect((await handlers.check(check(MOD_KEY, GUESSER))).status).toBe(429);
  });

  it('answers preflight with 204 + CORS for an allowed origin', async () => {
    const { handlers } = setup([], MOD_KEY);
    const res = await handlers.check(
      request({ method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }),
    );
    expect(res.status).toBe(204);
    expect(header(res, 'Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(header(res, 'Access-Control-Allow-Headers')).toBe(
      'Content-Type, x-moderation-key',
    );
  });

  it('keeps the CORS headers on a 401 so the browser can read the status', async () => {
    const { handlers } = setup([], MOD_KEY);
    const res = await handlers.check(check('nope', { origin: ALLOWED_ORIGIN }));
    expect(res.status).toBe(401);
    expect(header(res, 'Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(header(res, 'Vary')).toBe('Origin');
  });
});

describe('DELETE /entry/{weekKey}/{gameId}/{rowKey}', () => {
  const del = (
    params: Record<string, string>,
    key?: string,
    extraHeaders: Record<string, string> = {},
  ) =>
    request({
      method: 'DELETE',
      params,
      headers:
        key === undefined
          ? extraHeaders
          : { 'x-moderation-key': key, ...extraHeaders },
    });

  const params = (rowKey: string) => ({
    weekKey: WEEK,
    gameId: 'survivors',
    rowKey,
  });

  it('401s when MODERATION_KEY is unset, even with a header', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'BAD', 900, START);
    const { handlers, store } = setup([seeded], undefined);
    const res = await handlers.entry(del(params(seeded.rowKey), 'anything'));
    expect(res.status).toBe(401);
    expect(body(res)).toEqual({ error: 'Unauthorized' });
    expect(store.size).toBe(1);
  });

  it('401s on a missing or wrong header', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'BAD', 900, START);
    const { handlers } = setup([seeded], MOD_KEY);
    expect((await handlers.entry(del(params(seeded.rowKey)))).status).toBe(401);
    expect(
      (await handlers.entry(del(params(seeded.rowKey), 'wrong'))).status,
    ).toBe(401);
  });

  it('204s and removes the entity with the right key', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'BAD', 900, START);
    const { handlers, store } = setup([seeded], MOD_KEY);
    const res = await handlers.entry(del(params(seeded.rowKey), MOD_KEY));
    expect(res.status).toBe(204);
    expect(res.jsonBody).toBeUndefined();
    expect(header(res, 'Cache-Control')).toBe('no-store');
    expect(store.size).toBe(0);
  });

  it('404s when the entity does not exist', async () => {
    const { handlers } = setup([], MOD_KEY);
    const res = await handlers.entry(
      del(params(encodeRowKey(900, START)), MOD_KEY),
    );
    expect(res.status).toBe(404);
    expect(body(res)).toEqual({ error: 'Not found' });
  });

  it('400s on malformed params (after the auth check)', async () => {
    const { handlers } = setup([], MOD_KEY);
    const bad = [
      { weekKey: 'nope', gameId: 'survivors', rowKey: encodeRowKey(1, START) },
      { weekKey: WEEK, gameId: 'not-a-game', rowKey: encodeRowKey(1, START) },
      { weekKey: WEEK, gameId: 'survivors', rowKey: 'junk' },
    ];
    for (const p of bad) {
      const res = await handlers.entry(del(p, MOD_KEY));
      expect(res.status).toBe(400);
      expect(body(res)).toEqual({ error: 'Invalid entry reference' });
    }
  });

  it('429s the 11th wrong key from one IP, before touching storage', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'BAD', 900, START);
    const { handlers, store } = setup([seeded], MOD_KEY);
    const ip = { 'x-forwarded-for': '203.0.113.50' };
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      const res = await handlers.entry(del(params(seeded.rowKey), 'guess', ip));
      expect(res.status).toBe(401);
    }
    const limited = await handlers.entry(
      del(params(seeded.rowKey), MOD_KEY, ip),
    );
    expect(limited.status).toBe(429);
    expect(body(limited)).toEqual({
      error: 'Too many wrong passphrases — try again later',
    });
    expect(Number(header(limited, 'Retry-After'))).toBe(900);
    expect(store.size).toBe(1);
  });

  it('shares one failure budget with GET /moderation/check', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'BAD', 900, START);
    const { handlers } = setup([seeded], MOD_KEY);
    const ip = { 'x-forwarded-for': '203.0.113.50' };
    for (let i = 0; i < 9; i += 1) {
      const res = await handlers.check(
        request({ method: 'GET', headers: { 'x-moderation-key': 'guess', ...ip } }),
      );
      expect(res.status).toBe(401);
    }
    // The 10th failure lands on DELETE, spending the last of the budget.
    expect(
      (await handlers.entry(del(params(seeded.rowKey), 'guess', ip))).status,
    ).toBe(401);
    const limited = await handlers.entry(
      del(params(seeded.rowKey), MOD_KEY, ip),
    );
    expect(limited.status).toBe(429);
  });

  it('never spends budget on a correct key', async () => {
    const seeded = seedRow(WEEK, 'survivors', 'BAD', 900, START);
    const { handlers } = setup([seeded], MOD_KEY);
    const ip = { 'x-forwarded-for': '203.0.113.51' };
    // A whole room of teachers unlocking with the right phrase.
    for (let i = 0; i < 20; i += 1) {
      const res = await handlers.check(
        request({ method: 'GET', headers: { 'x-moderation-key': MOD_KEY, ...ip } }),
      );
      expect(res.status).toBe(204);
    }
    const typo = await handlers.entry(del(params(seeded.rowKey), 'typo', ip));
    expect(typo.status).toBe(401);
  });
});

describe('CORS', () => {
  const CORS_KEYS = [
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers',
    'Access-Control-Max-Age',
    'Vary',
  ];

  it('echoes an allowed origin on a normal response', async () => {
    const { handlers } = setup();
    const res = await handlers.weeks(
      request({ headers: { origin: ALLOWED_ORIGIN } }),
    );
    expect(header(res, 'Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(header(res, 'Vary')).toBe('Origin');
    expect(header(res, 'Access-Control-Allow-Methods')).toBe(
      'GET, POST, DELETE, OPTIONS',
    );
    expect(header(res, 'Access-Control-Allow-Headers')).toBe(
      'Content-Type, x-moderation-key',
    );
    expect(header(res, 'Access-Control-Max-Age')).toBe('86400');
  });

  it('processes a request with no Origin normally, without CORS headers', async () => {
    const { handlers } = setup();
    const res = await handlers.weeks(request());
    expect(res.status).toBe(200);
    for (const key of CORS_KEYS) expect(header(res, key)).toBeUndefined();
  });

  it('processes a disallowed origin normally, without CORS headers', async () => {
    const { handlers } = setup();
    const res = await handlers.weeks(
      request({ headers: { origin: 'https://evil.test' } }),
    );
    expect(res.status).toBe(200);
    for (const key of CORS_KEYS) expect(header(res, key)).toBeUndefined();
  });

  it('answers preflight with 204 + CORS for an allowed origin on every route', async () => {
    const { handlers } = setup([], MOD_KEY);
    const preflight = request({
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
      params: { weekKey: WEEK, gameId: 'survivors', rowKey: 'junk' },
    });
    for (const handler of [
      handlers.weeks,
      handlers.board,
      handlers.score,
      handlers.entry,
      handlers.check,
    ]) {
      const res = await handler(preflight);
      expect(res.status).toBe(204);
      expect(res.jsonBody).toBeUndefined();
      expect(header(res, 'Access-Control-Allow-Origin')).toBe(
        'http://localhost:5173',
      );
      expect(header(res, 'Access-Control-Max-Age')).toBe('86400');
      expect(header(res, 'Cache-Control')).toBe('no-store');
    }
  });

  it('answers preflight with a bare 204 for a disallowed or missing origin', async () => {
    const { handlers } = setup();
    const cases: Record<string, string>[] = [{}, { origin: 'https://evil.test' }];
    for (const headers of cases) {
      const res = await handlers.board(
        request({ method: 'OPTIONS', headers, params: { weekKey: 'junk' } }),
      );
      expect(res.status).toBe(204);
      for (const key of CORS_KEYS) expect(header(res, key)).toBeUndefined();
    }
  });

  it('does not run the handler body on preflight (no auth, no validation, no write)', async () => {
    const { handlers, store } = setup([], MOD_KEY);
    const res = await handlers.score(
      request({
        method: 'OPTIONS',
        params: { gameId: 'not-a-game' },
        headers: { origin: ALLOWED_ORIGIN },
      }),
    );
    expect(res.status).toBe(204);
    expect(store.size).toBe(0);
  });
});

describe('retention timer', () => {
  it('deletes entities outside the newest 6 weeks and logs the count', async () => {
    const weeks = [
      '2026-08-23',
      '2026-08-16',
      '2026-08-09',
      '2026-08-02',
      '2026-07-26',
      '2026-07-19',
      '2026-07-12',
    ];
    const { handlers, store } = setup(
      weeks.map((w, i) => seedRow(w, 'survivors', 'AAA', 100 + i, START - i)),
    );
    const log = vi.fn();
    const deleted = await handlers.retention({
      log,
      warn: vi.fn(),
      error: vi.fn(),
    });
    expect(deleted).toBe(1);
    expect(store.size).toBe(6);
    expect(String(log.mock.calls[0][0])).toContain('deleted 1');
  });
});
