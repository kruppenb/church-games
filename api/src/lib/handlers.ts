/**
 * The five request handlers, built by a factory so tests can drive them with a
 * `MemoryTableStore` and a pinned clock. `src/functions/*.ts` only registers
 * these with the Functions host.
 *
 * The request/logger shapes are structural subsets of `HttpRequest` /
 * `InvocationContext`, so the real objects pass straight through while tests can
 * hand-roll a plain object.
 */

import type { HttpResponseInit } from '@azure/functions';
import { parseAllowedOrigins } from './cors';
import { createResponder } from './http';
import { LeaderboardService } from './leaderboard-service';
import { checkModerationKey } from './moderation';
import { isRowKey } from './row-key';
import { RATE_LIMIT_MAX, checkRateLimit, clientIpFrom } from './rate-limit';
import type { TableStore } from './table-store';
import { isGameId, validateSubmission } from './validation';
import { DEFAULT_TIME_ZONE, isWeekKey } from './week-key';

export interface HandlerRequest {
  method: string;
  headers: { get(name: string): string | null | undefined };
  params: Record<string, string>;
  json(): Promise<unknown>;
}

export interface HandlerLogger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface HandlerDeps {
  store: TableStore;
  now?: () => Date;
  timeZone: string;
  moderationKey?: string;
  /** Defaults to the built-in list; extras come from `LEADERBOARD_ALLOWED_ORIGINS`. */
  allowedOrigins?: string[];
  /** POSTs per minute per IP; defaults to `RATE_LIMIT_MAX` (30). */
  rateLimitPerMinute?: number;
}

export interface Handlers {
  weeks(request: HandlerRequest, context?: HandlerLogger): Promise<HttpResponseInit>;
  board(request: HandlerRequest, context?: HandlerLogger): Promise<HttpResponseInit>;
  score(request: HandlerRequest, context?: HandlerLogger): Promise<HttpResponseInit>;
  entry(request: HandlerRequest, context?: HandlerLogger): Promise<HttpResponseInit>;
  retention(context?: HandlerLogger): Promise<number>;
  service: LeaderboardService;
}

const NOOP_LOGGER: HandlerLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const SERVER_ERROR = 'Leaderboard unavailable';

export function createHandlers(deps: HandlerDeps): Handlers {
  const allowedOrigins = deps.allowedOrigins ?? parseAllowedOrigins(undefined);
  const rateLimitPerMinute = deps.rateLimitPerMinute ?? RATE_LIMIT_MAX;
  const service = new LeaderboardService({
    store: deps.store,
    now: deps.now,
    timeZone: deps.timeZone || DEFAULT_TIME_ZONE,
  });

  const responderFor = (request: HandlerRequest) =>
    createResponder(request.headers.get('origin'), allowedOrigins);

  return {
    service,

    async weeks(request, context = NOOP_LOGGER) {
      const respond = responderFor(request);
      if (request.method === 'OPTIONS') return respond.preflight();
      try {
        const weeks = await service.listRetainedWeeks();
        return respond.json(200, {
          weeks,
          currentWeekKey: service.currentWeekKey(),
        });
      } catch (error) {
        context.error('GET /weeks failed', error);
        return respond.error(500, SERVER_ERROR);
      }
    },

    async board(request, context = NOOP_LOGGER) {
      const respond = responderFor(request);
      if (request.method === 'OPTIONS') return respond.preflight();

      const requested = request.params.weekKey ?? '';
      if (requested !== 'current' && !isWeekKey(requested)) {
        return respond.error(400, 'Invalid week');
      }

      try {
        const { weekKey, boards } = await service.getWeekBoards(requested);
        return respond.json(200, { weekKey, boards });
      } catch (error) {
        context.error('GET /board failed', error);
        return respond.error(500, SERVER_ERROR);
      }
    },

    async score(request, context = NOOP_LOGGER) {
      const respond = responderFor(request);
      if (request.method === 'OPTIONS') return respond.preflight();

      // Deliberately before validation: it is the cheap check, so a flood of
      // junk POSTs is turned away without touching storage. The budget is sized
      // for a whole NATed classroom sharing one IP — see rate-limit.ts.
      const limit = checkRateLimit(
        clientIpFrom(request.headers),
        Date.now(),
        rateLimitPerMinute,
      );
      if (!limit.allowed) {
        return respond.error(429, 'Too many scores — try again in a minute', {
          'Retry-After': String(limit.retryAfterSeconds),
        });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return respond.error(400, 'Body must be a JSON object');
      }

      const validated = validateSubmission(request.params.gameId ?? '', body);
      if (!validated.ok) return respond.error(400, validated.error);

      try {
        const result = await service.submitScore(
          validated.gameId,
          validated.value,
        );
        return respond.json(200, result);
      } catch (error) {
        context.error('POST /score failed', error);
        return respond.error(500, SERVER_ERROR);
      }
    },

    async entry(request, context = NOOP_LOGGER) {
      const respond = responderFor(request);
      if (request.method === 'OPTIONS') return respond.preflight();

      const provided = request.headers.get('x-moderation-key');
      if (!checkModerationKey(provided, deps.moderationKey)) {
        return respond.error(401, 'Unauthorized');
      }

      const { weekKey, gameId, rowKey } = request.params;
      if (!isWeekKey(weekKey) || !isGameId(gameId) || !isRowKey(rowKey)) {
        return respond.error(400, 'Invalid entry reference');
      }

      try {
        const deleted = await service.deleteEntry(weekKey, gameId, rowKey);
        return deleted ? respond.empty(204) : respond.error(404, 'Not found');
      } catch (error) {
        context.error('DELETE /entry failed', error);
        return respond.error(500, SERVER_ERROR);
      }
    },

    async retention(context = NOOP_LOGGER) {
      const deleted = await service.pruneOldWeeks();
      context.log(
        `leaderboard retention: deleted ${deleted} entities outside the newest weeks`,
      );
      return deleted;
    },
  };
}
