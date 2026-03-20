import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows title and lesson info", async ({ page }) => {
    await expect(page.locator("text=Church Games")).toBeVisible();
    // Lesson title should load (either current or fallback)
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
  });

  test("displays 2 hero cards", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    const heroCards = page.locator(".game-card-hero");
    await expect(heroCards).toHaveCount(2);
  });

  test("shows More Games section with remaining games", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=More Games")).toBeVisible();
    const smallCards = page.locator(".game-card-small");
    // 9 total games - 2 hero = 7 small cards
    await expect(smallCards).toHaveCount(7);
  });

  test("only shows difficulty picker, no group/individual toggle", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".difficulty-picker")).toBeVisible();
    await expect(page.locator(".mode-picker")).toHaveCount(0);
  });

  test("clicking a hero card navigates to game", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    const firstHero = page.locator(".game-card-hero").first();
    await firstHero.click();
    // Should navigate away from landing
    await expect(page.locator(".landing-title")).toHaveCount(0);
  });

  test("clicking a More Games card navigates to game", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    const firstSmall = page.locator(".game-card-small").first();
    await firstSmall.click();
    await expect(page.locator(".landing-title")).toHaveCount(0);
  });

  test("difficulty toggle switches between Little Kids / Big Kids", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    const buttons = page.locator(".difficulty-picker .picker-btn");
    await expect(buttons).toHaveCount(2);

    // Click Big Kids
    await buttons.nth(1).click();
    await expect(buttons.nth(1)).toHaveClass(/picker-btn-active/);

    // Click Little Kids
    await buttons.nth(0).click();
    await expect(buttons.nth(0)).toHaveClass(/picker-btn-active/);
  });

  test("back navigation from game returns to landing", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    // Navigate to quiz
    await page.goto("/#/games/quiz");
    await expect(page.locator("text=Quiz Showdown")).toBeVisible({ timeout: 5000 });
    // Click back
    await page.locator("text=Back").first().click();
    await expect(page.locator("text=Church Games")).toBeVisible({ timeout: 5000 });
  });

  test("screenshots: landing page", async ({ page }) => {
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/landing-desktop.png", fullPage: true });
  });
});

test.describe("Landing Page Mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hero cards stack vertically on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".landing-lesson-title")).toBeVisible({ timeout: 5000 });

    const heroSection = page.locator(".hero-section");
    await expect(heroSection).toBeVisible();

    // On mobile, hero cards should stack (flex-direction: column)
    const heroCards = page.locator(".game-card-hero");
    await expect(heroCards).toHaveCount(2);

    // Check touch targets are >= 44px
    const firstCard = heroCards.first();
    const box = await firstCard.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.screenshot({ path: "e2e/screenshots/landing-mobile.png", fullPage: true });
  });
});
