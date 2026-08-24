import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_FAILURE_MAX,
  AUTH_THROTTLE_WINDOW_MS,
  isAuthThrottled,
  recordAuthFailure,
  resetAuthThrottle,
  resolveAuthFailureLimit,
} from './auth-throttle';

const START = 1_756_000_000_000;

beforeEach(() => {
  resetAuthThrottle();
});

describe('resolveAuthFailureLimit', () => {
  it('defaults to 10 — a memorable phrase must not be online-guessable', () => {
    expect(AUTH_FAILURE_MAX).toBe(10);
    expect(resolveAuthFailureLimit(undefined)).toBe(10);
    expect(resolveAuthFailureLimit(null)).toBe(10);
    expect(resolveAuthFailureLimit('')).toBe(10);
    expect(resolveAuthFailureLimit('   ')).toBe(10);
  });

  it('accepts a positive integer from the app setting', () => {
    expect(resolveAuthFailureLimit('25')).toBe(25);
    expect(resolveAuthFailureLimit(25)).toBe(25);
    expect(resolveAuthFailureLimit(' 3 ')).toBe(3);
  });

  it('ignores invalid values and keeps the default', () => {
    for (const value of ['0', '-1', '2.5', 'x', 'NaN', 0, -1, 7.5, Number.NaN]) {
      expect(resolveAuthFailureLimit(value)).toBe(AUTH_FAILURE_MAX);
    }
  });
});

describe('isAuthThrottled / recordAuthFailure', () => {
  it('allows 10 failures and throttles the 11th check', () => {
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      expect(isAuthThrottled('1.1.1.1', START + i).throttled).toBe(false);
      recordAuthFailure('1.1.1.1', START + i);
    }
    const blocked = isAuthThrottled('1.1.1.1', START + AUTH_FAILURE_MAX);
    expect(blocked.throttled).toBe(true);
    // The oldest failure was at START, so the window frees up 15 min later.
    expect(blocked.throttled === true && blocked.retryAfterSeconds).toBe(900);
  });

  it('reports a shrinking Retry-After as the window ages', () => {
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      recordAuthFailure('2.2.2.2', START);
    }
    const half = isAuthThrottled('2.2.2.2', START + 450_000);
    expect(half.throttled === true && half.retryAfterSeconds).toBe(450);
    const late = isAuthThrottled(
      '2.2.2.2',
      START + AUTH_THROTTLE_WINDOW_MS - 1,
    );
    expect(late.throttled === true && late.retryAfterSeconds).toBe(1);
  });

  it('slides: only the aged-out failures free a slot', () => {
    // One failure per second until the budget is spent.
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      recordAuthFailure('3.3.3.3', START + i * 1000);
    }
    expect(isAuthThrottled('3.3.3.3', START + 9_500).throttled).toBe(true);
    // Just past the window only the very first failure has expired -> one slot.
    const freed = isAuthThrottled(
      '3.3.3.3',
      START + AUTH_THROTTLE_WINDOW_MS + 1,
    );
    expect(freed.throttled).toBe(false);
    recordAuthFailure('3.3.3.3', START + AUTH_THROTTLE_WINDOW_MS + 1);
    expect(
      isAuthThrottled('3.3.3.3', START + AUTH_THROTTLE_WINDOW_MS + 2).throttled,
    ).toBe(true);
  });

  it('does not record anything itself — reads are free', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isAuthThrottled('4.4.4.4', START + i).throttled).toBe(false);
    }
    recordAuthFailure('4.4.4.4', START);
    expect(isAuthThrottled('4.4.4.4', START + 1).throttled).toBe(false);
  });

  it('honours an explicit max', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(isAuthThrottled('5.5.5.5', START + i, 3).throttled).toBe(false);
      recordAuthFailure('5.5.5.5', START + i);
    }
    expect(isAuthThrottled('5.5.5.5', START + 3, 3).throttled).toBe(true);
    // The same history is fine under a roomier max.
    expect(isAuthThrottled('5.5.5.5', START + 4, 10).throttled).toBe(false);
  });

  it('keys separately per IP', () => {
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      recordAuthFailure('6.6.6.6', START + i);
    }
    expect(isAuthThrottled('6.6.6.6', START + 20).throttled).toBe(true);
    expect(isAuthThrottled('7.7.7.7', START + 20).throttled).toBe(false);
  });

  it('resetAuthThrottle clears every IP', () => {
    for (let i = 0; i < AUTH_FAILURE_MAX; i += 1) {
      recordAuthFailure('8.8.8.8', START + i);
    }
    expect(isAuthThrottled('8.8.8.8', START + 20).throttled).toBe(true);
    resetAuthThrottle();
    expect(isAuthThrottled('8.8.8.8', START + 20).throttled).toBe(false);
  });
});
