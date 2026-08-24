/**
 * Moderation key check for `DELETE /api/entry/...`.
 *
 * The secret lives only in Function App settings — never in the Vite build
 * (`VITE_TEACHER_TOKEN` is baked into the public bundle and must not be reused).
 * Both sides are SHA-256'd before comparison so `timingSafeEqual` gets
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
