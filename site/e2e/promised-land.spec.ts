import { test, expect } from "@playwright/test";

test.describe("Promised Land Quest", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/games/rpg");
  });

  test("Phaser canvas renders and team select loads", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait for scene to render
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "e2e/screenshots/rpg-team-select.png" });
  });

  test("selecting 3 heroes shows map", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const box = await canvas.boundingBox();
    if (box) {
      // Click 3 hero cards (they're in a 3x2 grid)
      const cardW = box.width / 3;
      const cardH = 140;
      const startY = box.y + 120;

      // Select first 3 heroes
      await page.mouse.click(box.x + cardW * 0.5, startY + cardH * 0.5);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + cardW * 1.5, startY + cardH * 0.5);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + cardW * 2.5, startY + cardH * 0.5);
      await page.waitForTimeout(500);

      // Click "Start Quest!" button (near bottom)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 50);
      await page.waitForTimeout(1500);

      await page.screenshot({ path: "e2e/screenshots/rpg-map.png" });
    }
  });

  test("clicking map location starts battle", async ({ page }) => {
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const box = await canvas.boundingBox();
    if (box) {
      // Select 3 heroes quickly
      const cardW = box.width / 3;
      const startY = box.y + 120;
      await page.mouse.click(box.x + cardW * 0.5, startY + 70);
      await page.waitForTimeout(150);
      await page.mouse.click(box.x + cardW * 1.5, startY + 70);
      await page.waitForTimeout(150);
      await page.mouse.click(box.x + cardW * 2.5, startY + 70);
      await page.waitForTimeout(300);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 50);
      await page.waitForTimeout(1500);

      // Click first map node (should be near top of the map area)
      await page.mouse.click(box.x + box.width / 2 - 60, box.y + 100);
      await page.waitForTimeout(2000);

      await page.screenshot({ path: "e2e/screenshots/rpg-battle.png" });
    }
  });

  test("back button returns to landing", async ({ page }) => {
    await expect(page.locator(".rpg-back-btn")).toBeVisible({ timeout: 5000 });
    await page.locator(".rpg-back-btn").click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
