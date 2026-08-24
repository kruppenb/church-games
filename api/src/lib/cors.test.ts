import { describe, expect, it } from 'vitest';
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  DEFAULT_ALLOWED_ORIGINS,
  corsHeaders,
  isOriginAllowed,
  parseAllowedOrigins,
} from './cors';

describe('parseAllowedOrigins', () => {
  it('returns the five defaults when nothing extra is configured', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(parseAllowedOrigins('')).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(DEFAULT_ALLOWED_ORIGINS).toEqual([
      'https://kruppenb.github.io',
      'http://localhost:5173',
      'http://localhost:4174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4174',
    ]);
  });

  it('appends comma-separated extras, trimmed and de-duplicated', () => {
    const origins = parseAllowedOrigins(
      ' https://example.test , https://other.test/ ,, https://kruppenb.github.io ',
    );
    expect(origins).toContain('https://example.test');
    expect(origins).toContain('https://other.test');
    expect(origins.filter((o) => o === 'https://kruppenb.github.io')).toHaveLength(
      1,
    );
    expect(origins).not.toContain('');
  });
});

describe('corsHeaders', () => {
  const allowed = parseAllowedOrigins('https://extra.test');

  it('echoes an allowed origin with the full header set', () => {
    expect(corsHeaders('https://kruppenb.github.io', allowed)).toEqual({
      'Access-Control-Allow-Origin': 'https://kruppenb.github.io',
      Vary: 'Origin',
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': '86400',
    });
    expect(ALLOWED_METHODS).toBe('GET, POST, DELETE, OPTIONS');
    expect(ALLOWED_HEADERS).toBe('Content-Type, x-moderation-key');
  });

  it('allows dev origins and configured extras', () => {
    for (const origin of [
      'http://localhost:5173',
      'http://localhost:4174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4174',
      'https://extra.test',
    ]) {
      expect(corsHeaders(origin, allowed)['Access-Control-Allow-Origin']).toBe(
        origin,
      );
    }
  });

  it('emits nothing for a missing origin (curl)', () => {
    expect(corsHeaders(null, allowed)).toEqual({});
    expect(corsHeaders(undefined, allowed)).toEqual({});
    expect(corsHeaders('', allowed)).toEqual({});
  });

  it('emits nothing for a disallowed origin (the browser blocks it)', () => {
    for (const origin of [
      'https://evil.test',
      'http://kruppenb.github.io',
      'https://kruppenb.github.io.evil.test',
      'https://kruppenb.github.io/church-games',
      'HTTPS://KRUPPENB.GITHUB.IO',
    ]) {
      expect(corsHeaders(origin, allowed)).toEqual({});
      expect(isOriginAllowed(origin, allowed)).toBe(false);
    }
  });
});
