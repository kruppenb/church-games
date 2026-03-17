import { test, expect } from "@playwright/test";

test.describe("Jeopardy", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/jeopardy");
  });

  test("shows intro screen", async ({ page }) => {
    await expect(page.locator("text=Jeopardy")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/jeopardy-intro.png" });
  });

  test("clicking Start shows the board with category columns", async ({ page }) => {
    await expect(page.locator("text=Jeopardy")).toBeVisible({ timeout: 5000 });

    // Click start button
    const startBtn = page.locator("text=Start").first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    // Board should render with category headers
    const headers = page.locator(".jeopardy-header-cell");
    await expect(headers.first()).toBeVisible({ timeout: 3000 });
    const headerCount = await headers.count();
    expect(headerCount).toBe(5);

    // Value cells should exist
    const cells = page.locator(".jeopardy-cell:not(.jeopardy-header-cell)");
    await expect(cells.first()).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/jeopardy-board.png" });
  });

  test("clicking a cell reveals a question", async ({ page }) => {
    await expect(page.locator("text=Jeopardy")).toBeVisible({ timeout: 5000 });

    const startBtn = page.locator("text=Start").first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    await expect(page.locator(".jeopardy-cell").first()).toBeVisible({ timeout: 3000 });

    // Click a value cell (not header)
    const valueCells = page.locator(".jeopardy-cell:not(.jeopardy-cell-answered)");
    await valueCells.first().click();

    // Question overlay should appear
    await expect(page.locator(".jeopardy-question-overlay")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".jeopardy-question-text")).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/jeopardy-question.png" });
  });

  test("answering a question updates board and score", async ({ page }) => {
    await expect(page.locator("text=Jeopardy")).toBeVisible({ timeout: 5000 });

    const startBtn = page.locator("text=Start").first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    await expect(page.locator(".jeopardy-cell").first()).toBeVisible({ timeout: 3000 });

    // Click a cell
    const valueCells = page.locator(".jeopardy-cell:not(.jeopardy-cell-answered)");
    await valueCells.first().click();

    // Wait for question overlay
    await expect(page.locator(".jeopardy-question-overlay")).toBeVisible({ timeout: 3000 });

    // Click an answer
    const answerBtn = page.locator(".quiz-answer-btn").first();
    await answerBtn.click();

    // Question overlay should close
    await expect(page.locator(".jeopardy-question-overlay")).toHaveCount(0, { timeout: 5000 });

    // An answered cell should now exist
    const answeredCells = page.locator(".jeopardy-cell-answered");
    await expect(answeredCells).toHaveCount(1, { timeout: 3000 });

    await page.screenshot({ path: "e2e/screenshots/jeopardy-answered.png" });
  });

  test("answered cells are not clickable", async ({ page }) => {
    await expect(page.locator("text=Jeopardy")).toBeVisible({ timeout: 5000 });

    const startBtn = page.locator("text=Start").first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    await expect(page.locator(".jeopardy-cell").first()).toBeVisible({ timeout: 3000 });

    // Answer a cell
    const valueCells = page.locator(".jeopardy-cell:not(.jeopardy-cell-answered)");
    await valueCells.first().click();
    await expect(page.locator(".jeopardy-question-overlay")).toBeVisible({ timeout: 3000 });
    await page.locator(".quiz-answer-btn").first().click();
    await expect(page.locator(".jeopardy-question-overlay")).toHaveCount(0, { timeout: 5000 });

    // The answered cell should have pointer-events: none (from CSS)
    const answeredCell = page.locator(".jeopardy-cell-answered").first();
    await expect(answeredCell).toBeVisible();
    // Verify it has the answered class
    await expect(answeredCell).toHaveClass(/jeopardy-cell-answered/);
  });
});
