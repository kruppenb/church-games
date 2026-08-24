/**
 * App settings, read lazily so a test (or the host, which populates
 * `process.env` after module load) can set them before the first call.
 */

import { parseAllowedOrigins } from './cors';
import { createHandlers, type Handlers } from './handlers';
import { resolveRateLimit } from './rate-limit';
import { AzureTableStore } from './table-store';
import { resolveTimeZone } from './week-key';

export const TABLE_NAME = 'leaderboard';

export interface ApiConfig {
  timeZone: string;
  moderationKey?: string;
  connectionString?: string;
  allowedOrigins: string[];
  tableName: string;
  rateLimitPerMinute: number;
}

function envValue(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function getConfig(): ApiConfig {
  return {
    timeZone: resolveTimeZone(envValue('LEADERBOARD_TIMEZONE')),
    moderationKey: envValue('MODERATION_KEY'),
    connectionString:
      envValue('LEADERBOARD_STORAGE_CONNECTION') ??
      envValue('AzureWebJobsStorage'),
    allowedOrigins: parseAllowedOrigins(envValue('LEADERBOARD_ALLOWED_ORIGINS')),
    tableName: envValue('LEADERBOARD_TABLE') ?? TABLE_NAME,
    rateLimitPerMinute: resolveRateLimit(
      envValue('LEADERBOARD_RATE_LIMIT_PER_MINUTE'),
    ),
  };
}

let cached: Handlers | null = null;

/** The production handler set — one TableClient reused for the process. */
export function getRuntimeHandlers(): Handlers {
  if (cached) return cached;
  const config = getConfig();
  if (!config.connectionString) {
    throw new Error(
      'No storage connection: set LEADERBOARD_STORAGE_CONNECTION or AzureWebJobsStorage',
    );
  }
  cached = createHandlers({
    store: AzureTableStore.fromConnectionString(
      config.connectionString,
      config.tableName,
    ),
    timeZone: config.timeZone,
    moderationKey: config.moderationKey,
    allowedOrigins: config.allowedOrigins,
    rateLimitPerMinute: config.rateLimitPerMinute,
  });
  return cached;
}

/** Test hook. */
export function resetRuntimeHandlers(): void {
  cached = null;
}
