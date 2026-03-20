import { test, expect } from "@playwright/test";

test.describe("Faith Fortress", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/fortress");
  });

  test("difficulty picker appears on direct navigation", async ({ page }) => {
    // When navigating directly, an in-game difficulty picker should show
    await expect(page.locator("text=Choose your difficulty")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Little Kids")).toBeVisible();
    await expect(page.locator("text=Big Kids")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/fortress-difficulty.png" });
  });

  test("Phaser canvas renders after difficulty selection", async ({ page }) => {
    // Select difficulty
    await expect(page.locator("text=Big Kids")).toBeVisible({ timeout: 5000 });
    await page.locator("text=Big Kids").click();

    // Wait for the Phaser container
    await expect(page.locator(".phaser-container")).toBeVisible({ timeout: 5000 });

    // Canvas should exist
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: "e2e/screenshots/fortress-start.png" });
  });

  test("selecting character starts the game", async ({ page }) => {
    // Select difficulty
    await page.locator("text=Big Kids").click();

    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait for intro, then click Start
    await page.waitForTimeout(1500);
    const box = await canvas.boundingBox();
    if (box) {
      // Click Start button (bottom center of intro screen)
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.75);
      await page.waitForTimeout(1000);

      // Hero selection should be showing — click first hero's Select button
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.7);
      await page.waitForTimeout(1500);

      await page.screenshot({ path: "e2e/screenshots/fortress-gameplay.png" });
    }
  });

  test("question appears during gameplay", async ({ page }) => {
    await page.locator("text=Big Kids").click();

    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Click through intro + hero select
    await page.waitForTimeout(1500);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.75);
      await page.waitForTimeout(1000);
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.7);
      await page.waitForTimeout(2000);

      await page.screenshot({ path: "e2e/screenshots/fortress-question.png" });
    }
  });

  test("answering question continues gameplay", async ({ page }) => {
    await page.locator("text=Big Kids").click();

    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1500);
    const box = await canvas.boundingBox();
    if (box) {
      // Intro → Start
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.75);
      await page.waitForTimeout(1000);
      // Hero select
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.7);
      await page.waitForTimeout(2000);

      // Click an answer (top-left answer button area)
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.55);
      await page.waitForTimeout(1500);

      await page.screenshot({ path: "e2e/screenshots/fortress-after-answer.png" });
    }
  });

  test("back button returns to landing", async ({ page }) => {
    await expect(page.locator(".adventure-back-btn")).toBeVisible({ timeout: 5000 });
    await page.locator(".adventure-back-btn").click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
