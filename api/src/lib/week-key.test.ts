import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  getWeekKey,
  isWeekKey,
  resetTimeZoneWarning,
  resolveTimeZone,
} from './week-key';

const PACIFIC = 'America/Los_Angeles';

afterEach(() => {
  resetTimeZoneWarning();
  vi.restoreAllMocks();
});

describe('getWeekKey', () => {
  it('maps a Sunday to itself', () => {
    // Sun 2026-08-23 11:00 Pacific
    expect(getWeekKey(new Date('2026-08-23T18:00:00Z'), PACIFIC)).toBe(
      '2026-08-23',
    );
  });

  it('maps every day of a week to the same Sunday', () => {
    const keys = [
      '2026-08-23T18:00:00Z', // Sun
      '2026-08-24T18:00:00Z', // Mon
      '2026-08-25T18:00:00Z',
      '2026-08-26T18:00:00Z',
      '2026-08-27T18:00:00Z',
      '2026-08-28T18:00:00Z',
      '2026-08-29T18:00:00Z', // Sat
    ].map((iso) => getWeekKey(new Date(iso), PACIFIC));
    expect(new Set(keys)).toEqual(new Set(['2026-08-23']));
  });

  it('keeps Saturday 23:30 Pacific in the previous Sunday week', () => {
    // 2026-08-23T06:30Z is Sat 2026-08-22 23:30 in Pacific
    expect(getWeekKey(new Date('2026-08-23T06:30:00Z'), PACIFIC)).toBe(
      '2026-08-16',
    );
  });

  it('rolls over at Sunday 00:00 Pacific', () => {
    // 2026-08-23T07:30Z is Sun 2026-08-23 00:30 in Pacific
    expect(getWeekKey(new Date('2026-08-23T07:30:00Z'), PACIFIC)).toBe(
      '2026-08-23',
    );
  });

  it('differs from UTC for the same instant near midnight', () => {
    const instant = new Date('2026-08-23T06:30:00Z');
    expect(getWeekKey(instant, PACIFIC)).toBe('2026-08-16');
    expect(getWeekKey(instant, 'UTC')).toBe('2026-08-23');
  });

  it('handles the spring-forward Sunday (PST -> PDT)', () => {
    // 2026-03-08 is the US DST start; 01:30 PST and 04:00 PDT are the same day
    expect(getWeekKey(new Date('2026-03-08T09:30:00Z'), PACIFIC)).toBe(
      '2026-03-08',
    );
    expect(getWeekKey(new Date('2026-03-08T11:00:00Z'), PACIFIC)).toBe(
      '2026-03-08',
    );
    // Sat 2026-03-07 23:00 PST still belongs to the previous week
    expect(getWeekKey(new Date('2026-03-08T07:00:00Z'), PACIFIC)).toBe(
      '2026-03-01',
    );
  });

  it('handles the fall-back Sunday (PDT -> PST), including the repeated hour', () => {
    // Both instants read as 01:30 local on Sun 2026-11-01
    expect(getWeekKey(new Date('2026-11-01T08:30:00Z'), PACIFIC)).toBe(
      '2026-11-01',
    );
    expect(getWeekKey(new Date('2026-11-01T09:30:00Z'), PACIFIC)).toBe(
      '2026-11-01',
    );
    // Sat 2026-10-31 23:30 PDT is still the previous week
    expect(getWeekKey(new Date('2026-11-01T06:30:00Z'), PACIFIC)).toBe(
      '2026-10-25',
    );
  });

  it('crosses a year boundary backwards', () => {
    // Fri 2027-01-01 -> Sun 2026-12-27
    expect(getWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe(
      '2026-12-27',
    );
    // Sat 2026-01-03 Pacific -> Sun 2025-12-28
    expect(getWeekKey(new Date('2026-01-04T05:00:00Z'), PACIFIC)).toBe(
      '2025-12-28',
    );
    expect(getWeekKey(new Date('2026-01-04T05:00:00Z'), 'UTC')).toBe(
      '2026-01-04',
    );
  });

  it('works for a positive-offset timezone', () => {
    // 2026-08-23T18:00Z is Mon 2026-08-24 04:00 in Sydney -> week of Aug 23
    expect(getWeekKey(new Date('2026-08-23T18:00:00Z'), 'Australia/Sydney')).toBe(
      '2026-08-23',
    );
    // 2026-08-22T18:00Z is Sun 2026-08-23 04:00 in Sydney -> its own week
    expect(getWeekKey(new Date('2026-08-22T18:00:00Z'), 'Australia/Sydney')).toBe(
      '2026-08-23',
    );
  });

  it('falls back to Pacific for an invalid timezone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const instant = new Date('2026-08-23T06:30:00Z');
    expect(getWeekKey(instant, 'Not/AZone')).toBe(getWeekKey(instant, PACIFIC));
    expect(getWeekKey(instant, '')).toBe(getWeekKey(instant, PACIFIC));
  });

  it('falls back to now for an invalid Date', () => {
    expect(isWeekKey(getWeekKey(new Date('nope'), PACIFIC))).toBe(true);
  });

  it('always returns a YYYY-MM-DD Sunday', () => {
    for (let day = 1; day <= 31; day += 1) {
      const key = getWeekKey(
        new Date(Date.UTC(2026, 6, day, 12, 0, 0)),
        PACIFIC,
      );
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${key}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });
});

describe('resolveTimeZone', () => {
  it('returns a valid zone unchanged', () => {
    expect(resolveTimeZone(PACIFIC)).toBe(PACIFIC);
    expect(resolveTimeZone('  UTC  ')).toBe('UTC');
  });

  it('returns the default for unset or blank values without warning', () => {
    const warn = vi.fn();
    expect(resolveTimeZone(undefined, warn)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone('   ', warn)).toBe(DEFAULT_TIME_ZONE);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns exactly once for an invalid zone', () => {
    const warn = vi.fn();
    expect(resolveTimeZone('Mars/Olympus', warn)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone('Mars/Olympus', warn)).toBe(DEFAULT_TIME_ZONE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Mars/Olympus');
  });
});

describe('isWeekKey', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isWeekKey('2026-08-23')).toBe(true);
    expect(isWeekKey('2026-8-23')).toBe(false);
    expect(isWeekKey('current')).toBe(false);
    expect(isWeekKey('2026-08-23 ')).toBe(false);
    expect(isWeekKey(20260823)).toBe(false);
    expect(isWeekKey(null)).toBe(false);
  });
});
