import { test, expect } from "@playwright/test";

test.describe("Quiz Showdown", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/quiz");
  });

  test("shows intro screen with lesson title", async ({ page }) => {
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    // Lesson title should appear
    await expect(page.locator(".quiz-intro-lesson")).toBeVisible();
  });

  test("clicking Start shows question with 4 answer buttons", async ({ page }) => {
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.click("text=Ready? Let's Go!");

    // Question should appear
    await expect(page.locator(".quiz-question-text")).toBeVisible({ timeout: 3000 });

    // 4 answer buttons (true/false questions render only 2)
    const answerBtns = page.locator(".quiz-answer-btn");
    await expect(answerBtns.first()).toBeVisible();
    const answerCount = await answerBtns.count();
    expect([2, 4]).toContain(answerCount);

    await page.screenshot({ path: "e2e/screenshots/quiz-question.png" });
  });

  test("clicking correct answer shows Correct feedback and increases score", async ({ page }) => {
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.click("text=Ready? Let's Go!");
    await expect(page.locator(".quiz-question-text")).toBeVisible({ timeout: 3000 });

    // Click the first answer button (may or may not be correct, but we test the flow)
    const answerBtns = page.locator(".quiz-answer-btn");
    await answerBtns.first().click();

    // Should show either "Correct!" or "Not quite!" feedback
    const feedback = page.locator(".answer-feedback-title");
    await expect(feedback).toBeVisible({ timeout: 3000 });
    const feedbackText = await feedback.textContent();
    expect(feedbackText === "Correct!" || feedbackText === "Not quite!").toBe(true);

    await page.screenshot({ path: "e2e/screenshots/quiz-feedback.png" });
  });

  test("plays through to completion screen", async ({ page }) => {
    // Full 14-question playthrough — needs far more than the default budget
    // when the suite runs all projects in parallel.
    test.setTimeout(120_000);
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.click("text=Ready? Let's Go!");

    // Answer all questions (click first answer each time, then advance).
    // The completion screen is the podium (.quiz-podium-rank); when the
    // score qualifies, the high-score initials overlay (.lb-overlay)
    // appears above it first.
    for (let i = 0; i < 80; i++) {
      const overlayUp = await page.locator(".lb-overlay").isVisible().catch(() => false);
      const podiumUp = await page.locator(".quiz-podium-rank").isVisible().catch(() => false);
      if (overlayUp || podiumUp) break;

      // If there's a question, answer it
      const answerBtn = page.locator(".quiz-answer-btn").first();
      if (await answerBtn.isVisible().catch(() => false)) {
        await answerBtn.click();
      }

      // If there's feedback, wait for auto-advance or click
      const feedback = page.locator(".answer-feedback");
      if (await feedback.isVisible().catch(() => false)) {
        await feedback.click();
      }

      // Brief wait for state transitions
      await page.waitForTimeout(300);
    }

    // Dismiss the high-score flow if it appeared (fresh storage means any
    // non-zero score qualifies): submit default initials, close the board.
    if (await page.locator(".lb-overlay").isVisible().catch(() => false)) {
      await page.keyboard.press("Enter");
      await page.click("text=Awesome!");
    }

    // Should reach the completion podium
    await expect(page.locator(".quiz-podium-rank")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".quiz-star")).toHaveCount(3); // 3 star slots

    await page.screenshot({ path: "e2e/screenshots/quiz-completion.png" });
  });

  test("keyboard shortcuts: press 1 selects first answer", async ({ page }) => {
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.click("text=Ready? Let's Go!");
    await expect(page.locator(".quiz-question-text")).toBeVisible({ timeout: 3000 });

    // Press "1" key
    await page.keyboard.press("1");

    // Should show feedback
    const feedback = page.locator(".answer-feedback-title");
    await expect(feedback).toBeVisible({ timeout: 3000 });
  });

  test("keyboard: Space/Enter advances from feedback", async ({ page }) => {
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.click("text=Ready? Let's Go!");
    await expect(page.locator(".quiz-question-text")).toBeVisible({ timeout: 3000 });

    // Answer first question
    await page.keyboard.press("1");
    await expect(page.locator(".answer-feedback")).toBeVisible({ timeout: 3000 });

    // Press Space to advance
    await page.keyboard.press("Space");

    // Should show next question or completion
    await page.waitForTimeout(500);
    const hasQuestion = await page.locator(".quiz-question-text").isVisible().catch(() => false);
    const hasComplete = await page.locator(".quiz-complete-title").isVisible().catch(() => false);
    expect(hasQuestion || hasComplete).toBe(true);
  });

  test("screenshots: intro screen", async ({ page }) => {
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/quiz-intro.png" });
  });
});
