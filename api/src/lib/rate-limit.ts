/**
 * In-memory sliding-window rate limiter for score submissions.
 *
 * Consumption-plan instances are short-lived and can scale out, so this is a
 * speed bump rather than a guarantee — which is all a classroom needs. No IP is
 * persisted anywhere; the map is evicted on a timer.
 *
 * Why 30/min and not something tighter: church wifi NATs the whole classroom
 * behind ONE public IP, so the limit is really "submissions per room, not per
 * kid". A class finishing a round together bursts a dozen POSTs in seconds, and
 * the limiter runs before validation (it is the cheap check), so rejected 400s
 * spend budget too. 30 leaves headroom for a full class plus retries while
 * still stopping a script. Override per deployment with the app setting
 * `LEADERBOARD_RATE_LIMIT_PER_MINUTE`.
 */

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 30;

const CLEANUP_INTERVAL_MS = 5 * 60_000;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Strip a trailing `:port`, unwrap `[ipv6]`. */
function stripPort(value: string): string {
  const bracketed = /^\[(.+)\]:\d+$/.exec(value);
  if (bracketed) return bracketed[1];
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1);
  const lastColon = value.lastIndexOf(':');
  if (
    lastColon > 0 &&
    value.indexOf(':') === lastColon &&
    /^\d+$/.test(value.slice(lastColon + 1))
  ) {
    return value.slice(0, lastColon);
  }
  return value;
}

/** Client IP = first entry of `x-forwarded-for`, else `"unknown"`. */
export function clientIpFrom(headers: {
  get(name: string): string | null | undefined;
}): string {
  const forwarded = headers.get('x-forwarded-for');
  if (typeof forwarded !== 'string' || !forwarded.trim()) return 'unknown';
  const first = forwarded.split(',')[0]?.trim() ?? '';
  const ip = stripPort(first).trim();
  return ip || 'unknown';
}

/**
 * A positive integer from the app setting, else the default. Blank, missing,
 * fractional, zero, negative and non-numeric all fall back to `RATE_LIMIT_MAX`.
 */
export function resolveRateLimit(
  value: string | number | undefined | null,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return RATE_LIMIT_MAX;
  return parsed;
}

export function checkRateLimit(
  key: string,
  now: number = Date.now(),
  max: number = RATE_LIMIT_MAX,
): RateLimitResult {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= max) {
    hits.set(key, timestamps);
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { allowed: true };
}

/** Test hook — the map is process-wide. */
export function resetRateLimit(): void {
  hits.clear();
}

// Periodically evict stale entries so the map cannot grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of hits) {
    const active = timestamps.filter((t) => t > cutoff);
    if (active.length === 0) hits.delete(key);
    else hits.set(key, active);
  }
}, CLEANUP_INTERVAL_MS).unref();
