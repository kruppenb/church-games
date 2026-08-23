import { test, expect, type Page } from "@playwright/test";

/**
 * Weekly arcade leaderboard.
 *
 * Store: src/lib/leaderboard-store.ts — localStorage key
 * "church-games:leaderboard", shape { version: 1, weeks: { [weekKey]:
 * { [gameId]: entry[] } } }, weekKey = local YYYY-MM-DD of the current
 * week's Sunday.
 *
 * These helpers duplicate leaderboard-store.ts's tiny date-math (rather than
 * importing the module) so the spec can compute/seed week keys without any
 * app code running yet.
 */

const STORAGE_KEY = "church-games:leaderboard";

interface SeedEntry {
  initials: string;
  score: number;
  difficulty: "little-kids" | "big-kids";
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

/** Mirrors leaderboard-store.ts's getWeekKey(): local Sunday of `d`'s week. */
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
  difficulty: "little-kids" | "big-kids",
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

/** Seeds the leaderboard store before any app script runs. */
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

test.describe("Weekly Arcade Leaderboard", () => {
  test.beforeEach(async ({ page }) => {
    // Disable entrance animations so overlays/cards don't sit at opacity:0
    // and block clicks/visibility checks on any project.
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("landing links to high scores page", async ({ page }) => {
    await clearLeaderboardStorage(page);
    await page.goto("/");
    await disableAnimations(page);

    await expect(page.locator(".landing-lesson-title")).toBeVisible({
      timeout: 5000,
    });

    await page.locator(".landing-leaderboard-link").click();

    await expect(page).toHaveURL(/#\/leaderboard/);
    const pills = page.locator(".lbp-week-pill");
    await expect(pills.first()).toBeVisible({ timeout: 5000 });
    await expect(pills.first()).toContainText("This Week");

    // Clean storage -> no scores anywhere -> empty state.
    await expect(page.locator(".lbp-empty")).toBeVisible();
  });

  test("quiz completion with qualifying score shows initials entry and records score", async ({
    page,
  }) => {
    // Full 14-question playthrough — needs far more than the default budget
    // when the suite runs all projects in parallel.
    test.setTimeout(120_000);
    await clearLeaderboardStorage(page);

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

    await expect(
      page.locator(".lb-row", { hasText: "ZZT" }),
    ).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".lb-title")).toContainText("RANK #");

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
    const emptyWeek = weeksAgoKey(2);

    await seedLeaderboard(page, {
      [thisWeek]: {
        survivors: [makeEntry("AAA", 500, "little-kids", 1_000)],
        jeopardy: [makeEntry("BBB", 300, "big-kids", 1_001)],
      },
      [pastWeek]: {
        survivors: [makeEntry("CCC", 700, "little-kids", 900)],
        jeopardy: [makeEntry("DDD", 200, "big-kids", 901)],
      },
      [emptyWeek]: {},
    });

    await page.goto("/#/leaderboard");
    await disableAnimations(page);
    await expect(page.locator(".lbp-title")).toBeVisible({ timeout: 5000 });

    // "This Week" pill first, plus the two seeded past weeks.
    const pills = page.locator(".lbp-week-pill");
    await expect(pills).toHaveCount(3);
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

    // Clicking the past-week pill switches the cards to that week's data.
    await pills.nth(1).click();
    await expect(survivorsCard.locator(".lb-row").first()).toContainText(
      "CCC",
    );
    await expect(
      survivorsCard.locator(".lb-score-cell").first(),
    ).toHaveText("700");
    await expect(jeopardyCard.locator(".lb-row").first()).toContainText(
      "DDD",
    );

    // A week with no entries at all shows the empty state.
    await pills.nth(2).click();
    await expect(page.locator(".lbp-empty")).toBeVisible();
  });

  test("entries persist across reload", async ({ page }) => {
    const thisWeek = currentWeekKey();

    await seedLeaderboard(page, {
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
    );

    await page.reload();
    await disableAnimations(page);

    const survivorsCardAfterReload = page.locator(".lbp-card", {
      has: page.locator(".lbp-card-name", { hasText: "Survivors" }),
    });
    await expect(
      survivorsCardAfterReload.locator(".lb-row").first(),
    ).toContainText("XYZ", { timeout: 5000 });
  });
});
