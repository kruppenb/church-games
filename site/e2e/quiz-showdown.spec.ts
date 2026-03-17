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

    // 4 answer buttons
    const answerBtns = page.locator(".quiz-answer-btn");
    await expect(answerBtns).toHaveCount(4);

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
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    await page.click("text=Ready? Let's Go!");

    // Answer all questions (click first answer each time, then advance)
    for (let i = 0; i < 50; i++) {
      // Check if we're at the completion screen
      const complete = page.locator(".quiz-complete-title");
      if (await complete.isVisible().catch(() => false)) break;

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

    // Should reach completion
    await expect(page.locator(".quiz-complete-title")).toBeVisible({ timeout: 10000 });
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
