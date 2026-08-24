import { test, expect } from "@playwright/test";

/**
 * Live smoke tests for the deployed shared-leaderboard Azure Functions API.
 *
 * Unlike leaderboard.spec.ts (which mocks the API at /__lb-api/* and drives
 * a real browser page), this spec talks to a real, already-deployed API
 * directly via Playwright's `request` fixture — no `page`, no local dev
 * server dependency, no CORS concerns (server-to-server request, not a
 * browser one).
 *
 * Skipped unless `LEADERBOARD_LIVE_API` is set (e.g.
 * `https://church-games-api.azurewebsites.net/api`), so it never runs as
 * part of the default `npm run test:e2e` suite or in CI without explicit
 * opt-in. Run it with `npm run test:e2e:live` after exporting the env var.
 *
 * This spec must NEVER write a real score to the shared board: every POST
 * below sends deliberately invalid data (blocklisted initials, an over-cap
 * score, a zero score) that the server is required to reject with 400
 * before it would ever persist anything.
 *
 * It also never guesses the teacher passphrase: the only moderation-related
 * check here is a single unauthenticated GET /moderation/check (no
 * x-moderation-key header at all, and never looped/retried), alongside the
 * single unauthenticated DELETE below — together at most two hits against
 * the live wrong-passphrase throttle (api/src/lib/auth-throttle.ts, 10 per
 * IP per 15 min, shared across both routes), nowhere near enough to trip it.
 */

const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const RAW_BASE = process.env.LEADERBOARD_LIVE_API ?? "";
const BASE_URL = RAW_BASE.replace(/\/+$/, "");

test.describe("Leaderboard API @live", () => {
  test.skip(
    !process.env.LEADERBOARD_LIVE_API,
    "Set LEADERBOARD_LIVE_API (e.g. https://church-games-api.azurewebsites.net/api) to run live leaderboard API smoke tests",
  );

  test("GET /weeks returns the expected shape", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/weeks`);
    expect(res.status()).toBe(200);

    const body = (await res.json()) as { weeks?: unknown; currentWeekKey?: unknown };
    expect(Array.isArray(body.weeks)).toBe(true);
    for (const week of body.weeks as unknown[]) {
      expect(typeof week).toBe("string");
      expect(week as string).toMatch(WEEK_KEY_RE);
    }
    expect((body.weeks as unknown[]).length).toBeLessThanOrEqual(6);
    expect(typeof body.currentWeekKey).toBe("string");
    expect(body.currentWeekKey as string).toMatch(WEEK_KEY_RE);
  });

  test("GET /board/current returns the expected shape", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/board/current`);
    expect(res.status()).toBe(200);

    const body = (await res.json()) as { weekKey?: unknown; boards?: unknown };
    expect(typeof body.weekKey).toBe("string");
    expect(body.weekKey as string).toMatch(WEEK_KEY_RE);
    expect(typeof body.boards).toBe("object");
    expect(body.boards).not.toBeNull();
    expect(Array.isArray(body.boards)).toBe(false);
  });

  test("POST /score rejects blocklisted initials with 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/score/quiz-showdown`, {
      data: { initials: "ASS", score: 100, difficulty: "little-kids" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /score rejects an over-cap score with 400", async ({ request }) => {
    // survivors' server-side cap is 200000 (see spec §1) — 999999 is well over it.
    const res = await request.post(`${BASE_URL}/score/survivors`, {
      data: { initials: "ZZZ", score: 999999, difficulty: "big-kids" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /score rejects a zero score with 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/score/quiz-showdown`, {
      data: { initials: "ZZZ", score: 0, difficulty: "little-kids" },
    });
    expect(res.status()).toBe(400);
  });

  test("DELETE /entry without a moderation key is rejected with 401", async ({ request }) => {
    // Well-formed but harmless/nonexistent path params: a valid-shaped
    // weekKey, a real gameId, and a valid-shaped (all-zero) rowKey. This
    // isolates the assertion to the auth check — no `x-moderation-key`
    // header is sent — regardless of whether the entity exists or how the
    // server orders its validation.
    const res = await request.delete(
      `${BASE_URL}/entry/2020-01-05/quiz-showdown/0000000_0000000000000`,
    );
    expect(res.status()).toBe(401);
  });

  test("GET /moderation/check without a passphrase is rejected with 401", async ({
    request,
  }) => {
    // No x-moderation-key header, and only ONE request — never a loop of
    // guesses at the actual passphrase. This still counts as one failure
    // against the live wrong-passphrase throttle (10 per IP per 15 min,
    // shared with DELETE), same as the single unauthenticated DELETE above,
    // so it stays well under budget.
    const res = await request.get(`${BASE_URL}/moderation/check`);
    expect(res.status()).toBe(401);
  });
});
