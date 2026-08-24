/**
 * Moderation key check — the teacher passphrase. It guards both
 * `GET /api/moderation/check` (the dashboard's unlock) and
 * `DELETE /api/entry/...` (removing a high score).
 *
 * The secret lives only in Function App settings — never in the Vite build or
 * the URL. Both sides are SHA-256'd before comparison so `timingSafeEqual` gets
 * equal-length buffers and the comparison leaks neither value nor length.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function checkModerationKey(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}
