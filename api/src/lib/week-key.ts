/**
 * Week-key math. A "week" starts on Sunday to match the church lesson cadence,
 * and the key is the `YYYY-MM-DD` calendar date of that Sunday **in the
 * configured IANA timezone** (Sunday maps to itself).
 *
 * The server owns the week key — client clocks drift, and a submit at 23:30 on
 * Saturday Pacific must land in the week that is still running locally, not the
 * one that already started in UTC.
 */

export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

export const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 86_400_000;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

let warnedAboutTimeZone = false;

/** Test hook — lets a suite observe the "warn once" behaviour more than once. */
export function resetTimeZoneWarning(): void {
  warnedAboutTimeZone = false;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate an IANA timezone, falling back to Pacific with a one-time warning.
 * Unset and blank both mean "use the default" and are NOT warned about; only a
 * configured-but-unusable value is.
 */
export function resolveTimeZone(
  timeZone: string | undefined | null,
  warn: (message: string) => void = (m) => console.warn(m),
): string {
  const candidate = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!candidate) return DEFAULT_TIME_ZONE;
  if (isValidTimeZone(candidate)) return candidate;
  if (!warnedAboutTimeZone) {
    warnedAboutTimeZone = true;
    warn(
      `LEADERBOARD_TIMEZONE "${candidate}" is not a valid IANA timezone — falling back to ${DEFAULT_TIME_ZONE}`,
    );
  }
  return DEFAULT_TIME_ZONE;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * `YYYY-MM-DD` of the Sunday that starts the week containing `now`, evaluated
 * in `timeZone`. Invalid/blank `timeZone` falls back to `America/Los_Angeles`.
 */
export function getWeekKey(now: Date, timeZone: string): string {
  const base =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const zone = resolveTimeZone(timeZone);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(base);

  let year = 0;
  let month = 0;
  let day = 0;
  let weekdayIndex = 0;
  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'weekday') weekdayIndex = WEEKDAY_INDEX[part.value] ?? 0;
  }

  return formatUtcDate(Date.UTC(year, month - 1, day) - weekdayIndex * DAY_MS);
}

/** Shape check only — does not verify the date exists on a calendar. */
export function isWeekKey(value: unknown): value is string {
  return typeof value === 'string' && WEEK_KEY_RE.test(value);
}
