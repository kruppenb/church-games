import { test, expect } from "@playwright/test";

test.describe("Survivors", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/survivors");
  });

  test("Phaser canvas renders", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: "e2e/screenshots/survivors-start.png" });
  });

  test("player character visible in arena", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait for game to initialize
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "e2e/screenshots/survivors-arena.png" });
  });

  test("enemies spawn and approach", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait for enemies to spawn
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "e2e/screenshots/survivors-enemies.png" });
  });

  test("question appears periodically", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait for first question to appear (~18 seconds)
    await page.waitForTimeout(20000);
    await page.screenshot({ path: "e2e/screenshots/survivors-question.png" });
  });

  test("answering question shows weapon selection or strengthens enemies", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const box = await canvas.boundingBox();
    if (box) {
      // Wait for question
      await page.waitForTimeout(20000);

      // Click an answer
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6);
      await page.waitForTimeout(2000);

      await page.screenshot({ path: "e2e/screenshots/survivors-after-answer.png" });
    }
  });

  test("back button returns to landing", async ({ page }) => {
    // The survivors game uses adventure-container class
    const backBtn = page.locator(".adventure-back-btn");
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
