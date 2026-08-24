/**
 * CORS headers for actual responses are added here. NOTE: in Azure the
 * Functions host answers browser preflights (OPTIONS + Origin) from the
 * PLATFORM allow-list before our handlers run, so infra/provision.sh keeps
 * that list equal to DEFAULT_ALLOWED_ORIGINS; our OPTIONS handler only gets
 * to answer preflights locally (`func start`). Keep the two lists in sync.
 *
 * No Origin header (curl) or a disallowed origin: the request is processed
 * normally, just without CORS headers. The browser is the enforcement point.
 */

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://kruppenb.github.io',
  'http://localhost:5173',
  'http://localhost:4174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4174',
];

export const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
export const ALLOWED_HEADERS = 'Content-Type, x-moderation-key';
export const MAX_AGE_SECONDS = '86400';

/** Defaults plus comma-separated extras from `LEADERBOARD_ALLOWED_ORIGINS`. */
export function parseAllowedOrigins(extra: string | undefined | null): string[] {
  const extras =
    typeof extra === 'string'
      ? extra
          .split(',')
          .map((o) => o.trim().replace(/\/+$/, ''))
          .filter(Boolean)
      : [];
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...extras]));
}

export function isOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (typeof origin !== 'string' || !origin) return false;
  return allowedOrigins.includes(origin);
}

/** `{}` when there is no Origin or the origin is not on the list. */
export function corsHeaders(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): Record<string, string> {
  if (!isOriginAllowed(origin, allowedOrigins)) return {};
  return {
    'Access-Control-Allow-Origin': origin as string,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': MAX_AGE_SECONDS,
  };
}
