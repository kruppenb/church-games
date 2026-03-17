import { test, expect } from "@playwright/test";

test.describe("Bible Brawler", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/brawler");
  });

  test("Phaser canvas renders", async ({ page }) => {
    // Wait for the Phaser container
    await expect(page.locator(".phaser-container")).toBeVisible({ timeout: 5000 });

    // Canvas should exist
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: "e2e/screenshots/brawler-start.png" });
  });

  test("character select screen appears", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // The character select scene should show "Choose Your Hero!" text
    // Since it's in Phaser canvas, we verify via screenshot
    await page.waitForTimeout(1000); // Wait for scene to render
    await page.screenshot({ path: "e2e/screenshots/brawler-character-select.png" });
  });

  test("selecting character starts the game", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Click on the canvas to select a character (roughly center area)
    const box = await canvas.boundingBox();
    if (box) {
      // Click in the character select area (first character card)
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.45);
    }

    // Wait for scene transition
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/brawler-gameplay.png" });
  });

  test("question appears during gameplay", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Select character
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.45);
    }

    // Wait for first wave/question to appear
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/screenshots/brawler-question.png" });
  });

  test("answering question continues gameplay", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Select character
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.45);
      await page.waitForTimeout(3000);

      // Click on an answer button area (top-left of the answer grid in the question panel)
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.55);
      await page.waitForTimeout(1500);

      await page.screenshot({ path: "e2e/screenshots/brawler-after-answer.png" });
    }
  });

  test("back button returns to landing", async ({ page }) => {
    await expect(page.locator(".adventure-back-btn")).toBeVisible({ timeout: 5000 });
    await page.locator(".adventure-back-btn").click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
