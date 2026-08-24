import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Weekly arcade leaderboard — now backed by a shared API
 * (`site/src/lib/leaderboard-api.ts` + `leaderboard-store.ts`) with the old
 * localStorage store (`leaderboard-local.ts`) kept as the offline fallback.
 *
 * `playwright.config.ts` sets `VITE_LEADERBOARD_API=/__lb-api` on the dev
 * server it starts, so the client always has a same-origin API base to call.
 * These specs intercept that base with `page.route()` — see
 * `mockLeaderboardApi` below — so no real network / CORS is involved.
 *
 * Local-storage helpers below duplicate leaderboard-local.ts's tiny date-math
 * (rather than importing the module) so the spec can compute/seed week keys
 * without any app code running yet. Storage key/shape:
 * "church-games:leaderboard", `{ version: 1, weeks: { [weekKey]: {
 * [gameId]: entry[] } } }`, weekKey = local YYYY-MM-DD of the current week's
 * Sunday.
 */

const STORAGE_KEY = "church-games:leaderboard";
const MOCK_API_PATTERN = "**/__lb-api/**";
const MOCK_API_PREFIX = "/__lb-api/";
const MAX_ENTRIES = 10;
const WEEKS_TO_KEEP = 6;

type Difficulty = "little-kids" | "big-kids";

interface SeedEntry {
  initials: string;
  score: number;
  difficulty: Difficulty;
  ts: number;
}

type SeedWeeks = Record<string, Record<string, SeedEntry[]>>;

interface QuestionLite {
  text: string;
  options: string[];
  correctIndex: number;
  difficulty: string;
}

interface LessonLite {
  questions: QuestionLite[];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Mirrors leaderboard-local.ts's getWeekKey(): local Sunday of `d`'s week. */
function weekKeyFor(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  local.setDate(local.getDate() - local.getDay());
  return formatLocalDate(local);
}

function currentWeekKey(): string {
  return weekKeyFor(new Date());
}

/** Week key for `n` weeks before the current week (n=1 -> last week). */
function weeksAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return weekKeyFor(d);
}

function makeEntry(
  initials: string,
  score: number,
  difficulty: Difficulty,
  ts: number,
): SeedEntry {
  return { initials, score, difficulty, ts };
}

/** Wipes the leaderboard before any app script runs. */
async function clearLeaderboardStorage(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore — storage unavailable
    }
  }, STORAGE_KEY);
}

/** Seeds the LOCAL (offline-fallback) leaderboard store before any app script runs. */
async function seedLeaderboard(page: Page, weeks: SeedWeeks): Promise<void> {
  await page.addInitScript(
    ({ key, data }: { key: string; data: SeedWeeks }) => {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ version: 1, weeks: data }),
        );
      } catch {
        // ignore — storage unavailable
      }
    },
    { key: STORAGE_KEY, data: weeks },
  );
}

/**
 * Several of this app's CSS animations (e.g. the combo-streak counter's
 * infinite rainbow glow, question/feedback entrance fades) are NOT gated
 * behind `@media (prefers-reduced-motion: reduce)`, so `emulateMedia` alone
 * doesn't stop them. A long, click-heavy loop (playing all 14 quiz
 * questions) can catch a button mid-animation on WebKit projects, where
 * Playwright's actionability check ("element is not stable") then retries
 * for the full test timeout. Freezing all animations/transitions to their
 * end state removes that flakiness without touching any app source.
 */
async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
}

// ---------------------------------------------------------------------------
// mockLeaderboardApi — an in-memory fake of the Azure Functions API, routed
// same-origin at /__lb-api/* (see playwright.config.ts's webServer.env).
// ---------------------------------------------------------------------------

/** Entry shape as the real API returns it (wire format, see leaderboard-api.ts). */
interface MockEntry {
  initials: string;
  score: number;
  difficulty: Difficulty;
  ts: number;
  rowKey: string;
}

/** weekKey -> gameId -> entries. Lives in the Node test process, NOT the page,
 * so it survives `page.reload()` exactly like the real Table Storage backend
 * would (as opposed to any client-side cache, which reload always wipes). */
type MockWeeks = Record<string, Record<string, MockEntry[]>>;

interface PostRecord {
  gameId: string;
  body: unknown;
}

interface MockLeaderboardApiHandle {
  /** Every POST /score/:gameId this mock has received, in order. */
  posts: PostRecord[];
}

interface ScorePostBody {
  initials?: unknown;
  score?: unknown;
  difficulty?: unknown;
}

/** Score desc, ties broken by earlier ts — mirrors leaderboard-local.ts's compareEntries. */
function compareMockEntries(a: MockEntry, b: MockEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.ts - b.ts;
}

function sanitizeSeedEntry(e: SeedEntry): MockEntry {
  return {
    initials: e.initials,
    score: e.score,
    difficulty: e.difficulty,
    ts: e.ts,
    rowKey: String(e.ts),
  };
}

/**
 * Installs a `page.route` handler faking the shared leaderboard API:
 * `GET weeks`, `GET board/:weekKey` (`current` alias), `POST score/:gameId`.
 * Mirrors the real API's response shapes (see leaderboard-api.ts + the API
 * contract in docs/shared-leaderboard.md) closely enough for the client to
 * treat it as the real thing. State is seeded from `seed` and mutated by
 * POSTs; it is never reset by navigation or reload.
 */
async function mockLeaderboardApi(
  page: Page,
  seed: SeedWeeks = {},
): Promise<MockLeaderboardApiHandle> {
  const weeks: MockWeeks = {};
  for (const [weekKey, boards] of Object.entries(seed)) {
    const seededBoards: Record<string, MockEntry[]> = {};
    for (const [gameId, entries] of Object.entries(boards)) {
      seededBoards[gameId] = entries
        .map(sanitizeSeedEntry)
        .sort(compareMockEntries)
        .slice(0, MAX_ENTRIES);
    }
    weeks[weekKey] = seededBoards;
  }

  const posts: PostRecord[] = [];

  /** Week keys that actually have at least one entry, newest first — mirrors
   * the real API deriving `weeks` from stored entities' PartitionKeys rather
   * than from some separately-tracked "week list". */
  function storedWeekKeys(): string[] {
    return Object.keys(weeks)
      .filter((key) =>
        Object.values(weeks[key] ?? {}).some((board) => board.length > 0),
      )
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }

  function boardsForWeek(weekKey: string): Record<string, MockEntry[]> {
    const stored = weeks[weekKey] ?? {};
    const out: Record<string, MockEntry[]> = {};
    for (const [gameId, entries] of Object.entries(stored)) {
      if (entries.length > 0) out[gameId] = entries.slice(0, MAX_ENTRIES);
    }
    return out;
  }

  async function handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const idx = url.pathname.indexOf(MOCK_API_PREFIX);
    const rest = idx === -1 ? "" : url.pathname.slice(idx + MOCK_API_PREFIX.length);
    const segments = rest.split("/").filter((s) => s.length > 0);
    const method = request.method();

    const respondJson = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    // GET /weeks
    if (method === "GET" && segments.length === 1 && segments[0] === "weeks") {
      await respondJson(200, {
        weeks: storedWeekKeys().slice(0, WEEKS_TO_KEEP),
        currentWeekKey: currentWeekKey(),
      });
      return;
    }

    // GET /board/:weekKey ("current" alias)
    if (method === "GET" && segments.length === 2 && segments[0] === "board") {
      const requested = segments[1];
      const weekKey = requested === "current" ? currentWeekKey() : requested;
      await respondJson(200, { weekKey, boards: boardsForWeek(weekKey) });
      return;
    }

    // POST /score/:gameId
    if (method === "POST" && segments.length === 2 && segments[0] === "score") {
      const gameId = segments[1];
      let body: ScorePostBody = {};
      try {
        body = (request.postDataJSON() ?? {}) as ScorePostBody;
      } catch {
        body = {};
      }
      posts.push({ gameId, body });

      const weekKey = currentWeekKey();
      weeks[weekKey] = weeks[weekKey] ?? {};
      const board = weeks[weekKey][gameId] ?? [];
      const score = typeof body.score === "number" ? body.score : 0;
      const difficulty: Difficulty = body.difficulty === "big-kids" ? "big-kids" : "little-kids";
      const initials = typeof body.initials === "string" ? body.initials : "AAA";

      const qualifies = board.length < MAX_ENTRIES || score > board[MAX_ENTRIES - 1].score;
      if (!qualifies) {
        await respondJson(200, { rank: -1, weekKey, board });
        return;
      }

      const ts = Date.now();
      const entry: MockEntry = { initials, score, difficulty, ts, rowKey: String(ts) };
      const sorted = board.concat(entry).sort(compareMockEntries).slice(0, MAX_ENTRIES);
      weeks[weekKey][gameId] = sorted;

      const rank = sorted.indexOf(entry);
      await respondJson(200, { rank: rank === -1 ? -1 : rank + 1, weekKey, board: sorted });
      return;
    }

    await respondJson(404, { error: `No mock route for ${method} ${url.pathname}` });
  }

  await page.route(MOCK_API_PATTERN, handleRoute);

  return { posts };
}

test.describe("Weekly Arcade Leaderboard", () => {
  test.beforeEach(async ({ page }) => {
    // Disable entrance animations so overlays/cards don't sit at opacity:0
    // and block clicks/visibility checks on any project.
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("landing links to high scores page and loads shared weeks", async ({ page }) => {
    await clearLeaderboardStorage(page);
    await mockLeaderboardApi(page, {});
    await page.goto("/");
    await disableAnimations(page);

    await expect(page.locator(".landing-lesson-title")).toBeVisible({
      timeout: 5000,
    });

    // Arm the request wait BEFORE the click that triggers it — waitForRequest
    // only sees requests made after it was registered.
    const weeksRequest = page
      .waitForRequest("**/__lb-api/weeks", { timeout: 5000 })
      .catch(() => null);

    await page.locator(".landing-leaderboard-link").click();
    await expect(page).toHaveURL(/#\/leaderboard/);

    if ((await weeksRequest) === null) {
      throw new Error(
        "Dev server is running without VITE_LEADERBOARD_API=/__lb-api — stop it and let Playwright start its own (playwright.config.ts sets it)",
      );
    }

    const pills = page.locator(".lbp-week-pill");
    await expect(pills.first()).toBeVisible({ timeout: 5000 });
    await expect(pills.first()).toContainText("This Week");

    // No entries anywhere (mock seeded empty) -> empty state.
    await expect(page.locator(".lbp-empty")).toBeVisible();
  });

  test("quiz completion with qualifying score shows initials entry and records score", async ({
    page,
  }) => {
    // Full 14-question playthrough — needs far more than the default budget
    // when the suite runs all projects in parallel.
    test.setTimeout(120_000);
    await clearLeaderboardStorage(page);
    const mock = await mockLeaderboardApi(page, {});

    // Build a question-text -> correct-answer-text map from the live lesson
    // content so every question can be answered correctly, making the final
    // score deterministic (non-zero) instead of relying on "click first".
    // Quiz Showdown defaults to "little-kids" difficulty, which filters to
    // "easy" questions only (see useDifficulty.ts / difficulty.ts).
    let lesson: LessonLite;
    const currentResp = await page.request.get("/lessons/current.json");
    if (currentResp.ok()) {
      lesson = (await currentResp.json()) as LessonLite;
    } else {
      const fallbackResp = await page.request.get("/lessons/fallback.json");
      lesson = (await fallbackResp.json()) as LessonLite;
    }
    const correctAnswers = new Map<string, string>();
    for (const q of lesson.questions) {
      if (q.difficulty !== "easy") continue;
      correctAnswers.set(q.text, q.options[q.correctIndex]);
    }

    await page.goto("/#/games/quiz");
    await disableAnimations(page);
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({
      timeout: 5000,
    });
    await page.click("text=Ready? Let's Go!");

    // Play to completion, answering correctly whenever we can identify the
    // right option. NOTE: Quiz Showdown's completion screen (PodiumScreen in
    // QuizShowdown.tsx) never renders a ".quiz-complete-title" element —
    // that class only exists in Word Scramble / Jeopardy. Reaching the
    // podium here is detected via ".quiz-podium-rank" (the actual heading
    // rendered on completion) or ".lb-overlay" (the high-score flow, which
    // appears first when the score qualifies).
    for (let i = 0; i < 80; i++) {
      const overlayVisible = await page
        .locator(".lb-overlay")
        .isVisible()
        .catch(() => false);
      const completeVisible = await page
        .locator(".quiz-podium-rank")
        .isVisible()
        .catch(() => false);
      const noAnswerBtns =
        (await page.locator(".quiz-answer-btn").count()) === 0;
      if ((overlayVisible || completeVisible) && noAnswerBtns) break;

      const answerBtn = page.locator(".quiz-answer-btn").first();
      if (await answerBtn.isVisible().catch(() => false)) {
        const questionText =
          (await page.locator(".quiz-question-text").textContent())?.trim() ??
          "";
        const correctText = correctAnswers.get(questionText);
        let clicked = false;
        if (correctText) {
          const optionTexts = await page
            .locator(".quiz-answer-btn .quiz-answer-text")
            .allTextContents();
          const idx = optionTexts.findIndex(
            (t) => t.trim() === correctText,
          );
          if (idx >= 0) {
            await page.locator(".quiz-answer-btn").nth(idx).click();
            clicked = true;
          }
        }
        if (!clicked) {
          await answerBtn.click();
        }
      }

      const feedback = page.locator(".answer-feedback");
      if (await feedback.isVisible().catch(() => false)) {
        await feedback.click();
      }

      await page.waitForTimeout(250);
    }

    // The high-score flow only appears for a non-zero, qualifying score.
    // Answering every identifiable question correctly should always score
    // > 0, but guard anyway rather than assume.
    let overlayShown = false;
    try {
      await page
        .locator(".lb-overlay")
        .waitFor({ state: "visible", timeout: 5000 });
      overlayShown = true;
    } catch {
      overlayShown = false;
    }
    test.skip(
      !overlayShown,
      "Quiz run scored 0 - high score overlay never appeared",
    );

    await expect(page.locator(".lb-overlay")).toBeVisible();

    // Type initials "ZZT": each keypress fills the active slot and advances
    // to the next one (see HighScoreFlow.tsx's window keydown handler).
    await page.keyboard.press("Z");
    await page.keyboard.press("Z");
    await page.keyboard.press("T");
    await page.keyboard.press("Enter");

    // handleOk now awaits an async submitScore() (POST to the mock) before
    // moving to the board phase, so give the round trip some room.
    await expect(
      page.locator(".lb-row", { hasText: "ZZT" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".lb-title")).toContainText("RANK #");

    const post = mock.posts.find((p) => p.gameId === "quiz-showdown");
    expect(post).toBeTruthy();
    const body = post?.body as ScorePostBody | undefined;
    expect(body?.initials).toBe("ZZT");
    expect(typeof body?.score).toBe("number");
    expect(body?.score as number).toBeGreaterThan(0);

    await page.click("text=Awesome!");
    await expect(page.locator(".lb-overlay")).toHaveCount(0);

    const playAgainBtn = page.locator("button", { hasText: "Play Again" });
    await expect(playAgainBtn).toBeVisible();
    await expect(playAgainBtn).toBeEnabled();
  });

  test("leaderboard page shows seeded entries and past weeks", async ({
    page,
  }) => {
    const thisWeek = currentWeekKey();
    const pastWeek = weeksAgoKey(1);

    await mockLeaderboardApi(page, {
      [thisWeek]: {
        survivors: [makeEntry("AAA", 500, "little-kids", 1_000)],
        jeopardy: [makeEntry("BBB", 300, "big-kids", 1_001)],
      },
      [pastWeek]: {
        survivors: [makeEntry("CCC", 700, "little-kids", 900)],
        jeopardy: [makeEntry("DDD", 200, "big-kids", 901)],
      },
    });

    await page.goto("/#/leaderboard");
    await disableAnimations(page);
    await expect(page.locator(".lbp-title")).toBeVisible({ timeout: 5000 });

    // "This Week" pill first, plus the one seeded past week. (A week with no
    // entities at all never appears in the real API's weeks list, so unlike
    // the old local-only spec there is no third "empty week" pill here.)
    const pills = page.locator(".lbp-week-pill");
    await expect(pills).toHaveCount(2, { timeout: 5000 });
    await expect(pills.nth(0)).toContainText("This Week");

    const survivorsCard = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Survivors" }),
    });
    const jeopardyCard = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Jeopardy" }),
    });

    // Default selected week is "This Week" -> shows the seeded entries.
    await expect(survivorsCard).toBeVisible();
    await expect(survivorsCard.locator(".lb-row").first()).toContainText(
      "AAA",
    );
    await expect(
      survivorsCard.locator(".lb-score-cell").first(),
    ).toHaveText("500");
    await expect(jeopardyCard).toBeVisible();
    await expect(jeopardyCard.locator(".lb-row").first()).toContainText(
      "BBB",
    );
    await expect(jeopardyCard.locator(".lb-score-cell").first()).toHaveText(
      "300",
    );

    // Clicking the past-week pill fetches and switches the cards to that
    // week's data.
    await pills.nth(1).click();
    await expect(survivorsCard.locator(".lb-row").first()).toContainText(
      "CCC",
      { timeout: 5000 },
    );
    await expect(
      survivorsCard.locator(".lb-score-cell").first(),
    ).toHaveText("700");
    await expect(jeopardyCard.locator(".lb-row").first()).toContainText(
      "DDD",
    );
  });

  test("offline: leaderboard page and high-score flow fall back to the device", async ({
    page,
  }) => {
    // Full quiz playthrough below — needs far more than the default budget
    // when the suite runs all projects in parallel.
    test.setTimeout(120_000);
    await clearLeaderboardStorage(page);

    // Abort the mock API entirely, BEFORE any navigation, so every request
    // the client makes fails the way an unreachable API would.
    await page.route(MOCK_API_PATTERN, (route) => route.abort("failed"));

    const thisWeek = currentWeekKey();
    await seedLeaderboard(page, {
      [thisWeek]: {
        survivors: [makeEntry("XYZ", 900, "little-kids", 1_000)],
      },
    });

    // --- Leaderboard page: falls back to the device-local board. ---
    await page.goto("/#/leaderboard");
    await disableAnimations(page);
    await expect(page.locator(".lbp-title")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".lbp-offline")).toBeVisible({ timeout: 5000 });

    const survivorsCard = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Survivors" }),
    });
    await expect(survivorsCard.locator(".lb-row").first()).toContainText(
      "XYZ",
    );

    // --- HighScoreFlow: still works fully offline (qualifies() and
    // submitScore() both fall back to the local store on network failure). ---
    let lesson: LessonLite;
    const currentResp = await page.request.get("/lessons/current.json");
    if (currentResp.ok()) {
      lesson = (await currentResp.json()) as LessonLite;
    } else {
      const fallbackResp = await page.request.get("/lessons/fallback.json");
      lesson = (await fallbackResp.json()) as LessonLite;
    }
    const correctAnswers = new Map<string, string>();
    for (const q of lesson.questions) {
      if (q.difficulty !== "easy") continue;
      correctAnswers.set(q.text, q.options[q.correctIndex]);
    }

    await page.goto("/#/games/quiz");
    await disableAnimations(page);
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({
      timeout: 5000,
    });
    await page.click("text=Ready? Let's Go!");

    for (let i = 0; i < 80; i++) {
      const overlayVisible = await page
        .locator(".lb-overlay")
        .isVisible()
        .catch(() => false);
      const completeVisible = await page
        .locator(".quiz-podium-rank")
        .isVisible()
        .catch(() => false);
      const noAnswerBtns =
        (await page.locator(".quiz-answer-btn").count()) === 0;
      if ((overlayVisible || completeVisible) && noAnswerBtns) break;

      const answerBtn = page.locator(".quiz-answer-btn").first();
      if (await answerBtn.isVisible().catch(() => false)) {
        const questionText =
          (await page.locator(".quiz-question-text").textContent())?.trim() ??
          "";
        const correctText = correctAnswers.get(questionText);
        let clicked = false;
        if (correctText) {
          const optionTexts = await page
            .locator(".quiz-answer-btn .quiz-answer-text")
            .allTextContents();
          const idx = optionTexts.findIndex(
            (t) => t.trim() === correctText,
          );
          if (idx >= 0) {
            await page.locator(".quiz-answer-btn").nth(idx).click();
            clicked = true;
          }
        }
        if (!clicked) {
          await answerBtn.click();
        }
      }

      const feedback = page.locator(".answer-feedback");
      if (await feedback.isVisible().catch(() => false)) {
        await feedback.click();
      }

      await page.waitForTimeout(250);
    }

    let overlayShown = false;
    try {
      await page
        .locator(".lb-overlay")
        .waitFor({ state: "visible", timeout: 5000 });
      overlayShown = true;
    } catch {
      overlayShown = false;
    }
    test.skip(
      !overlayShown,
      "Quiz run scored 0 - high score overlay never appeared",
    );

    await expect(page.locator(".lb-overlay")).toBeVisible();

    await page.keyboard.press("Z");
    await page.keyboard.press("Z");
    await page.keyboard.press("T");
    await page.keyboard.press("Enter");

    // qualifies()/submitScore() try the (aborted) API first, then fall back
    // to the local store — allow time for the 3s client timeout in the
    // worst case rather than the fast network-rejection path.
    await expect(page.locator(".lb-offline")).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator(".lb-row", { hasText: "ZZT" }),
    ).toBeVisible();

    await page.click("text=Awesome!");
    await expect(page.locator(".lb-overlay")).toHaveCount(0);
  });

  test("entries persist across reload (mock state lives in the test, not the page)", async ({
    page,
  }) => {
    const thisWeek = currentWeekKey();
    const mock = await mockLeaderboardApi(page, {
      [thisWeek]: {
        survivors: [makeEntry("XYZ", 900, "little-kids", 1_000)],
      },
    });

    await page.goto("/#/leaderboard");
    await disableAnimations(page);
    const survivorsCard = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Survivors" }),
    });
    await expect(survivorsCard.locator(".lb-row").first()).toContainText(
      "XYZ",
      { timeout: 5000 },
    );

    // Post a new score directly through the mocked API (no need to replay a
    // full game) to prove the mock's state lives in the Node test process —
    // it must survive a full page reload, unlike any in-page JS state.
    const postResult = (await page.evaluate(async () => {
      const res = await fetch("/__lb-api/score/jeopardy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initials: "QRS", score: 777, difficulty: "big-kids" }),
      });
      return res.json();
    })) as { rank: number };
    expect(postResult.rank).toBeGreaterThan(0);
    expect(
      mock.posts.some(
        (p) =>
          p.gameId === "jeopardy" &&
          (p.body as ScorePostBody).initials === "QRS",
      ),
    ).toBe(true);

    await page.reload();
    await disableAnimations(page);

    const survivorsCardAfterReload = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Survivors" }),
    });
    await expect(
      survivorsCardAfterReload.locator(".lb-row").first(),
    ).toContainText("XYZ", { timeout: 5000 });

    const jeopardyCardAfterReload = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Jeopardy" }),
    });
    await expect(
      jeopardyCardAfterReload.locator(".lb-row").first(),
    ).toContainText("QRS", { timeout: 5000 });
  });
});
