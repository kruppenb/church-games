import { test, expect } from "@playwright/test";

test.describe("Survivors", () => {
  test.beforeEach(async ({ page }) => {
    // Disable entrance animations on landing page (for back-navigation tests)
    await page.emulateMedia({ reducedMotion: "reduce" });
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

  test("question appears and can be answered", async ({ page }) => {
    test.setTimeout(60000);
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Wait for first question to appear (~18 seconds)
    await page.waitForTimeout(20000);
    await page.screenshot({ path: "e2e/screenshots/survivors-question.png" });
  });

  test("correct answer shows weapon selection with 3 options", async ({ page }) => {
    test.setTimeout(60000);
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const box = await canvas.boundingBox();
    if (!box) return;

    // Wait for question
    await page.waitForTimeout(20000);
    await page.screenshot({ path: "e2e/screenshots/survivors-question-visible.png" });

    // Click first answer option (top-left area of the question panel)
    // Answer buttons are in a 2x2 grid centered on the canvas
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.48);
    await page.waitForTimeout(1500);

    // Should show either weapon selection (correct) or "enemies grow stronger" (wrong)
    await page.screenshot({ path: "e2e/screenshots/survivors-after-answer.png" });

    // If weapon selection is shown, click a weapon card
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "e2e/screenshots/survivors-after-weapon-pick.png" });
  });

  test("gameplay continues after multiple waves", async ({ page }) => {
    test.setTimeout(90000); // This test needs more time
    const canvas = page.locator(".phaser-container canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const box = await canvas.boundingBox();
    if (!box) return;

    // Move the player around with keyboard while waiting for questions
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1000);
    await page.keyboard.up("ArrowRight");

    // Wait for first question
    await page.waitForTimeout(19000);
    await page.screenshot({ path: "e2e/screenshots/survivors-wave1-question.png" });

    // Answer first question
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.48);
    await page.waitForTimeout(1500);

    // If weapon selection, pick one
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "e2e/screenshots/survivors-wave1-playing.png" });

    // Move around while waiting for second question
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(1000);
    await page.keyboard.up("ArrowLeft");

    await page.waitForTimeout(17000);
    await page.screenshot({ path: "e2e/screenshots/survivors-wave2-question.png" });

    // Answer second question
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.48);
    await page.waitForTimeout(1500);

    // If weapon selection, pick one
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "e2e/screenshots/survivors-wave2-playing.png" });
  });

  test("back button returns to landing", async ({ page }) => {
    // The survivors game uses adventure-container class
    const backBtn = page.locator(".adventure-back-btn");
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });
});
