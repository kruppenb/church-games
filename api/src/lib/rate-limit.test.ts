import { beforeEach, describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  clientIpFrom,
  resetRateLimit,
  resolveRateLimit,
} from './rate-limit';

const headers = (value?: string) => ({
  get: (name: string) =>
    name.toLowerCase() === 'x-forwarded-for' ? (value ?? null) : null,
});

beforeEach(() => {
  resetRateLimit();
});

describe('clientIpFrom', () => {
  it('uses the first x-forwarded-for entry', () => {
    expect(clientIpFrom(headers('203.0.113.5, 70.41.3.18'))).toBe('203.0.113.5');
  });

  it('trims whitespace and strips a trailing port', () => {
    expect(clientIpFrom(headers('  203.0.113.5:41234 '))).toBe('203.0.113.5');
    expect(clientIpFrom(headers('[2001:db8::1]:443'))).toBe('2001:db8::1');
    expect(clientIpFrom(headers('2001:db8::1'))).toBe('2001:db8::1');
  });

  it('falls back to "unknown"', () => {
    expect(clientIpFrom(headers(undefined))).toBe('unknown');
    expect(clientIpFrom(headers('   '))).toBe('unknown');
    expect(clientIpFrom({ get: () => null })).toBe('unknown');
  });
});

describe('resolveRateLimit', () => {
  it('defaults to 30 — one NATed classroom shares a public IP', () => {
    expect(RATE_LIMIT_MAX).toBe(30);
    expect(resolveRateLimit(undefined)).toBe(30);
    expect(resolveRateLimit(null)).toBe(30);
    expect(resolveRateLimit('')).toBe(30);
    expect(resolveRateLimit('   ')).toBe(30);
  });

  it('accepts a positive integer from the app setting', () => {
    expect(resolveRateLimit('60')).toBe(60);
    expect(resolveRateLimit(' 5 ')).toBe(5);
    expect(resolveRateLimit(120)).toBe(120);
  });

  it('ignores invalid values and keeps the default', () => {
    for (const value of ['0', '-5', '2.5', 'abc', 'NaN', '1e3px', 0, -1, 7.5, Number.NaN]) {
      expect(resolveRateLimit(value)).toBe(RATE_LIMIT_MAX);
    }
  });
});

describe('checkRateLimit', () => {
  it('allows the first 30 in a minute and 429s the 31st', () => {
    const start = 1_756_000_000_000;
    expect(RATE_LIMIT_MAX).toBe(30);
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      expect(checkRateLimit('1.1.1.1', start + i).allowed).toBe(true);
    }
    const blocked = checkRateLimit('1.1.1.1', start + RATE_LIMIT_MAX);
    expect(blocked.allowed).toBe(false);
    expect(blocked.allowed === false && blocked.retryAfterSeconds).toBe(60);
  });

  it('honours an explicit max', () => {
    const start = 1_756_000_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit('7.7.7.7', start + i, 3).allowed).toBe(true);
    }
    expect(checkRateLimit('7.7.7.7', start + 3, 3).allowed).toBe(false);
    // The same history is fine under a roomier max.
    expect(checkRateLimit('7.7.7.7', start + 4, 30).allowed).toBe(true);
  });

  it('fits a whole class finishing a round together', () => {
    const start = 1_756_000_000_000;
    // 20 kids behind one NAT IP submit within a few seconds.
    for (let i = 0; i < 20; i += 1) {
      expect(checkRateLimit('203.0.113.1', start + i * 250).allowed).toBe(true);
    }
    // Plus 8 rejected retries still leaves room.
    for (let i = 0; i < 8; i += 1) {
      expect(checkRateLimit('203.0.113.1', start + 6_000 + i).allowed).toBe(
        true,
      );
    }
  });

  it('reports a shrinking Retry-After as the window ages', () => {
    const start = 1_756_000_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      checkRateLimit('2.2.2.2', start);
    }
    const half = checkRateLimit('2.2.2.2', start + 30_000);
    expect(half.allowed === false && half.retryAfterSeconds).toBe(30);
  });

  it('slides: only the aged-out hits free a slot', () => {
    const start = 1_756_000_000_000;
    // One hit per second until the budget is spent.
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      checkRateLimit('3.3.3.3', start + i * 1000);
    }
    expect(checkRateLimit('3.3.3.3', start + 9_500).allowed).toBe(false);
    // Just past the window only the very first hit has expired -> one slot.
    expect(
      checkRateLimit('3.3.3.3', start + RATE_LIMIT_WINDOW_MS + 1).allowed,
    ).toBe(true);
    expect(
      checkRateLimit('3.3.3.3', start + RATE_LIMIT_WINDOW_MS + 2).allowed,
    ).toBe(false);
  });

  it('keys separately per IP', () => {
    const start = 1_756_000_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      checkRateLimit('4.4.4.4', start + i);
    }
    expect(checkRateLimit('4.4.4.4', start + 20).allowed).toBe(false);
    expect(checkRateLimit('5.5.5.5', start + 20).allowed).toBe(true);
  });

  it('never reports a Retry-After below 1 second', () => {
    const start = 1_756_000_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      checkRateLimit('6.6.6.6', start);
    }
    const late = checkRateLimit('6.6.6.6', start + RATE_LIMIT_WINDOW_MS - 1);
    expect(late.allowed === false && late.retryAfterSeconds).toBe(1);
  });
});
