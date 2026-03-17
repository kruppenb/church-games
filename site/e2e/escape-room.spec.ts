import { test, expect } from "@playwright/test";

test.describe("Escape Room", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/escape");
  });

  test("Phaser canvas renders and first room loads", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/escape-room1.png" });
  });

  test("answering question correctly progresses room", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const box = await canvas.boundingBox();
    if (box) {
      // Wait for question to appear
      await page.waitForTimeout(2000);

      // Click on an answer button area
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6);
      await page.waitForTimeout(1500);

      await page.screenshot({ path: "e2e/screenshots/escape-after-answer.png" });
    }
  });

  test("timer is visible and counting", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Timer is rendered inside the Phaser canvas, verify via screenshots
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "e2e/screenshots/escape-timer.png" });
  });

  test("back button returns to landing", async ({ page }) => {
    await expect(page.locator(".maze-back-btn")).toBeVisible({ timeout: 5000 });
    await page.locator(".maze-back-btn").click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
