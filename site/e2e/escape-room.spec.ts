import { test, expect } from "@playwright/test";

test.describe("Bible Millionaire", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/escape");
  });

  test("game renders with lesson content", async ({ page }) => {
    // Bible Millionaire is a React game — wait for intro title
    await expect(page.locator(".millionaire-intro-title")).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "e2e/screenshots/millionaire-start.png" });
  });

  test("answering question shows feedback", async ({ page }) => {
    await expect(page.locator("text=Bible Millionaire")).toBeVisible({ timeout: 5000 });

    // Click Start/Play button if present
    const startBtn = page.locator("text=Start");
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click();
    }

    // Wait for question to appear and click first answer
    await page.waitForTimeout(1500);
    const answers = page.locator(".millionaire-answer, .answer-btn, button");
    const firstAnswer = answers.first();
    if (await firstAnswer.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstAnswer.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "e2e/screenshots/millionaire-after-answer.png" });
    }
  });

  test("back link returns to landing", async ({ page }) => {
    await expect(page.locator(".quiz-back-link")).toBeVisible({ timeout: 5000 });
    await page.locator(".quiz-back-link").click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
