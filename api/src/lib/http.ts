/**
 * Response helpers. Every response carries `Cache-Control: no-store` (boards
 * change mid-lesson and a cached top-10 is worse than a slow one) plus the CORS
 * headers for the request's Origin, if that origin is allowed.
 */

import type { HttpResponseInit } from '@azure/functions';
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  MAX_AGE_SECONDS,
  corsHeaders,
} from './cors';

export interface Responder {
  json(
    status: number,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): HttpResponseInit;
  error(
    status: number,
    message: string,
    extraHeaders?: Record<string, string>,
  ): HttpResponseInit;
  empty(status: number, extraHeaders?: Record<string, string>): HttpResponseInit;
  /** `204` + CORS when the origin is allowed, `204` bare otherwise. */
  preflight(): HttpResponseInit;
}

export function createResponder(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): Responder {
  const base: Record<string, string> = {
    'Cache-Control': 'no-store',
    ...corsHeaders(origin, allowedOrigins),
  };

  const withBase = (extra?: Record<string, string>): Record<string, string> =>
    extra ? { ...base, ...extra } : { ...base };

  return {
    json(status, body, extraHeaders) {
      return { status, jsonBody: body, headers: withBase(extraHeaders) };
    },
    error(status, message, extraHeaders) {
      return {
        status,
        jsonBody: { error: message },
        headers: withBase(extraHeaders),
      };
    },
    empty(status, extraHeaders) {
      return { status, headers: withBase(extraHeaders) };
    },
    preflight() {
      const cors = corsHeaders(origin, allowedOrigins);
      if (Object.keys(cors).length === 0) {
        return { status: 204, headers: { 'Cache-Control': 'no-store' } };
      }
      return {
        status: 204,
        headers: {
          'Cache-Control': 'no-store',
          ...cors,
          'Access-Control-Allow-Methods': ALLOWED_METHODS,
          'Access-Control-Allow-Headers': ALLOWED_HEADERS,
          'Access-Control-Max-Age': MAX_AGE_SECONDS,
        },
      };
    },
  };
}
