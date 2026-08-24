/**
 * Table Storage key encoding.
 *
 * `partitionKey = "{weekKey}_{gameId}"` and
 * `rowKey       = "{9999999 - score, 7 digits}_{ts, 13 digits}"`.
 *
 * Table Storage returns rows RowKey-ascending inside a partition, so an
 * unsorted partition scan already yields best-first order with the
 * earlier-timestamp tie-break baked in — no sorting in code, and no
 * read-modify-write race when two kids submit at once.
 */

import { WEEK_KEY_RE } from './week-key';

export const ROW_KEY_RE = /^\d{7}_\d{13}$/;

/** Inverted-score base: keeps the padded field 7 digits wide for any legal score. */
export const SCORE_BASE = 9_999_999;

const MAX_TS = 9_999_999_999_999; // 13 digits

export function encodeRowKey(score: number, ts: number): string {
  const safeScore = Math.min(Math.max(Math.floor(score), 0), SCORE_BASE);
  const safeTs = Math.min(Math.max(Math.floor(ts), 0), MAX_TS);
  const inverted = String(SCORE_BASE - safeScore).padStart(7, '0');
  return `${inverted}_${String(safeTs).padStart(13, '0')}`;
}

export function decodeRowKey(
  rowKey: string,
): { score: number; ts: number } | null {
  if (typeof rowKey !== 'string' || !ROW_KEY_RE.test(rowKey)) return null;
  const [invertedRaw, tsRaw] = rowKey.split('_');
  const score = SCORE_BASE - Number(invertedRaw);
  const ts = Number(tsRaw);
  if (!Number.isFinite(score) || !Number.isFinite(ts)) return null;
  return { score, ts };
}

export function isRowKey(value: unknown): value is string {
  return typeof value === 'string' && ROW_KEY_RE.test(value);
}

export function encodePartitionKey(weekKey: string, gameId: string): string {
  return `${weekKey}_${gameId}`;
}

export function decodePartitionKey(
  partitionKey: string,
): { weekKey: string; gameId: string } | null {
  if (typeof partitionKey !== 'string' || partitionKey.length < 12) return null;
  const weekKey = partitionKey.slice(0, 10);
  if (!WEEK_KEY_RE.test(weekKey)) return null;
  if (partitionKey[10] !== '_') return null;
  const gameId = partitionKey.slice(11);
  if (!gameId) return null;
  return { weekKey, gameId };
}

/** The first 10 chars of a partition key are always its week key. */
export function weekKeyFromPartitionKey(partitionKey: string): string | null {
  const parsed = decodePartitionKey(partitionKey);
  return parsed ? parsed.weekKey : null;
}

/**
 * OData filter selecting every partition of one week.
 * "`" (0x60) is the character immediately after "_" (0x5F), so the half-open
 * range `[weekKey_, weekKey\`)` covers exactly this week's game partitions.
 */
export function weekPartitionFilter(weekKey: string): string {
  return `PartitionKey ge '${weekKey}_' and PartitionKey lt '${weekKey}\`'`;
}
