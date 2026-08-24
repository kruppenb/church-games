/**
 * In-memory sliding-window throttle for wrong teacher passphrases.
 *
 * Deliberately a separate module from `rate-limit.ts`: that map counts *every*
 * score POST in a 60 s window, which is a different budget with a different
 * shape. Sharing it would let a busy classroom's scores lock the teacher out.
 *
 * Why failures only: the passphrase is shared by 3-4 volunteers who may all be
 * on the same church wifi. Counting successes would mean a room of teachers
 * doing the right thing trips the throttle; counting only wrong/missing keys
 * means the honest case never spends budget.
 *
 * Why per IP: there is no account to key on — the passphrase *is* the identity.
 * Church wifi NATs the whole room behind one public IP, so a guesser in that
 * room locks the room out for the rest of the window. That is acceptable: the
 * alternative (no key at all) is a global lockout, and the honest path never
 * counts.
 *
 * Why 10 per 15 minutes: the phrase is memorable by design (3-4 real words), so
 * it must not be online-guessable. 10 tries per IP per quarter hour makes even a
 * 1-in-10,000 guess space take days, while leaving a teacher who fat-fingers a
 * hyphen plenty of room. Override per deployment with the app setting
 * `LEADERBOARD_AUTH_FAILURES_PER_15MIN`.
 *
 * Same caveats as the score limiter: consumption-plan instances are short-lived
 * and can scale out, so this is a speed bump per instance rather than a
 * guarantee. No IP is persisted; the map is evicted on a timer.
 */

export const AUTH_THROTTLE_WINDOW_MS = 15 * 60_000;
export const AUTH_FAILURE_MAX = 10;

const CLEANUP_INTERVAL_MS = 5 * 60_000;

const failures = new Map<string, number[]>();

export type AuthThrottleResult =
  | { throttled: false }
  | { throttled: true; retryAfterSeconds: number };

/**
 * A positive integer from the app setting, else the default. Blank, missing,
 * fractional, zero, negative and non-numeric all fall back to
 * `AUTH_FAILURE_MAX`.
 */
export function resolveAuthFailureLimit(
  value: string | number | undefined | null,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return AUTH_FAILURE_MAX;
  return parsed;
}

/**
 * Pure read: prunes timestamps that have left the window and reports whether
 * the IP has burned its budget. Never records — only `recordAuthFailure` does.
 */
export function isAuthThrottled(
  ip: string,
  now: number = Date.now(),
  max: number = AUTH_FAILURE_MAX,
): AuthThrottleResult {
  const windowStart = now - AUTH_THROTTLE_WINDOW_MS;
  const timestamps = (failures.get(ip) ?? []).filter((t) => t > windowStart);
  if (timestamps.length === 0) failures.delete(ip);
  else failures.set(ip, timestamps);

  if (timestamps.length < max) return { throttled: false };

  const oldest = timestamps[0];
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldest + AUTH_THROTTLE_WINDOW_MS - now) / 1000),
  );
  return { throttled: true, retryAfterSeconds };
}

/** Record one wrong/missing passphrase. Successes are never recorded. */
export function recordAuthFailure(ip: string, now: number = Date.now()): void {
  const windowStart = now - AUTH_THROTTLE_WINDOW_MS;
  const timestamps = (failures.get(ip) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  failures.set(ip, timestamps);
}

/** Test hook — the map is process-wide. */
export function resetAuthThrottle(): void {
  failures.clear();
}

// Periodically evict stale entries so the map cannot grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - AUTH_THROTTLE_WINDOW_MS;
  for (const [ip, timestamps] of failures) {
    const active = timestamps.filter((t) => t > cutoff);
    if (active.length === 0) failures.delete(ip);
    else failures.set(ip, active);
  }
}, CLEANUP_INTERVAL_MS).unref();
