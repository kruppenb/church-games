import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_FAILURE_MAX } from './auth-throttle';
import { getConfig } from './config';
import { DEFAULT_ALLOWED_ORIGINS } from './cors';
import { RATE_LIMIT_MAX } from './rate-limit';
import { DEFAULT_TIME_ZONE, resetTimeZoneWarning } from './week-key';

const KEYS = [
  'LEADERBOARD_TIMEZONE',
  'MODERATION_KEY',
  'LEADERBOARD_STORAGE_CONNECTION',
  'AzureWebJobsStorage',
  'LEADERBOARD_ALLOWED_ORIGINS',
  'LEADERBOARD_TABLE',
  'LEADERBOARD_RATE_LIMIT_PER_MINUTE',
  'LEADERBOARD_AUTH_FAILURES_PER_15MIN',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetTimeZoneWarning();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe('getConfig', () => {
  it('applies defaults when nothing is set', () => {
    expect(getConfig()).toEqual({
      timeZone: DEFAULT_TIME_ZONE,
      moderationKey: undefined,
      connectionString: undefined,
      allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
      tableName: 'leaderboard',
      rateLimitPerMinute: 30,
      authFailuresPer15Min: 10,
    });
    expect(RATE_LIMIT_MAX).toBe(30);
    expect(AUTH_FAILURE_MAX).toBe(10);
  });

  it('reads the environment lazily, on every call', () => {
    expect(getConfig().moderationKey).toBeUndefined();
    process.env.MODERATION_KEY = 'set-after-import';
    expect(getConfig().moderationKey).toBe('set-after-import');
  });

  it('prefers LEADERBOARD_STORAGE_CONNECTION over AzureWebJobsStorage', () => {
    process.env.AzureWebJobsStorage = 'fallback';
    expect(getConfig().connectionString).toBe('fallback');
    process.env.LEADERBOARD_STORAGE_CONNECTION = 'preferred';
    expect(getConfig().connectionString).toBe('preferred');
  });

  it('treats blank settings as unset', () => {
    process.env.MODERATION_KEY = '   ';
    process.env.LEADERBOARD_TABLE = '';
    const config = getConfig();
    expect(config.moderationKey).toBeUndefined();
    expect(config.tableName).toBe('leaderboard');
  });

  it('falls back to Pacific for an invalid timezone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.LEADERBOARD_TIMEZONE = 'Mars/Olympus';
    expect(getConfig().timeZone).toBe(DEFAULT_TIME_ZONE);
    process.env.LEADERBOARD_TIMEZONE = 'UTC';
    expect(getConfig().timeZone).toBe('UTC');
  });

  it('appends extra CORS origins', () => {
    process.env.LEADERBOARD_ALLOWED_ORIGINS = 'https://a.test, https://b.test';
    const origins = getConfig().allowedOrigins;
    expect(origins).toContain('https://a.test');
    expect(origins).toContain('https://b.test');
    expect(origins).toContain('https://kruppenb.github.io');
  });

  it('honours LEADERBOARD_RATE_LIMIT_PER_MINUTE', () => {
    process.env.LEADERBOARD_RATE_LIMIT_PER_MINUTE = '60';
    expect(getConfig().rateLimitPerMinute).toBe(60);
  });

  it('ignores an invalid LEADERBOARD_RATE_LIMIT_PER_MINUTE', () => {
    for (const value of ['0', '-1', '2.5', 'lots', '']) {
      process.env.LEADERBOARD_RATE_LIMIT_PER_MINUTE = value;
      expect(getConfig().rateLimitPerMinute).toBe(30);
    }
  });

  it('honours LEADERBOARD_AUTH_FAILURES_PER_15MIN', () => {
    process.env.LEADERBOARD_AUTH_FAILURES_PER_15MIN = '25';
    expect(getConfig().authFailuresPer15Min).toBe(25);
  });

  it('ignores an invalid LEADERBOARD_AUTH_FAILURES_PER_15MIN', () => {
    for (const value of ['0', '-1', '2.5', 'lots', '']) {
      process.env.LEADERBOARD_AUTH_FAILURES_PER_15MIN = value;
      expect(getConfig().authFailuresPer15Min).toBe(10);
    }
  });
});
