import { test, expect, Page } from "@playwright/test";

async function waitForCanvas(page: Page) {
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function getScaleFactor(page: Page) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  return {
    scaleX: box.width / 800,
    scaleY: box.height / 600,
    offsetX: box.x,
    offsetY: box.y,
  };
}

async function clickGameCoord(page: Page, gameX: number, gameY: number) {
  const { scaleX, scaleY, offsetX, offsetY } = await getScaleFactor(page);
  await page.mouse.click(offsetX + gameX * scaleX, offsetY + gameY * scaleY);
}

async function clickTile(
  page: Page, row: number, col: number,
  gc: { tileSize: number; offsetX: number; offsetY: number },
) {
  await clickGameCoord(page, gc.offsetX + col * gc.tileSize + gc.tileSize / 2,
    gc.offsetY + row * gc.tileSize + gc.tileSize / 2);
}

async function swapTiles(
  page: Page, r1: number, c1: number, r2: number, c2: number,
  gc: { tileSize: number; offsetX: number; offsetY: number },
) {
  await clickTile(page, r1, c1, gc);
  await page.waitForTimeout(150);
  await clickTile(page, r2, c2, gc);
  await page.waitForTimeout(800);
}

const LK = { tileSize: 85, offsetX: 145, offsetY: 70 };
const BK = { tileSize: 63, offsetX: 148, offsetY: 73 };

function allSwaps6x6(): [number, number, number, number][] {
  const swaps: [number, number, number, number][] = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 5; c++) swaps.push([r, c, r, c + 1]);
  for (let c = 0; c < 6; c++)
    for (let r = 0; r < 5; r++) swaps.push([r, c, r + 1, c]);
  return swaps;
}

test.describe("Kingdom Match Visual Validation", () => {
  test.setTimeout(180000);

  test("clean playthrough - all game states", async ({ page }) => {
    const swaps = allSwaps6x6();

    // 1. Landing page
    await page.goto("/");
    await page.waitForSelector(".landing-lesson-title", { timeout: 10000 });
    await page.screenshot({ path: "e2e/screenshots/match-01-landing.png" });
    await expect(page.locator("text=Kingdom Match")).toBeVisible();

    // 2. Intro
    await page.goto("/#/games/match");
    await waitForCanvas(page);
    await page.screenshot({ path: "e2e/screenshots/match-02-intro.png" });
    await expect(page.locator("canvas")).toBeVisible();

    // 3. Start game
    await clickGameCoord(page, 400, 480);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/screenshots/match-03-grid.png" });

    // 4. Selection highlight
    await clickTile(page, 3, 3, LK);
    await page.waitForTimeout(500);
    await page.screenshot({ path: "e2e/screenshots/match-04-selected.png" });
    await clickTile(page, 3, 3, LK);
    await page.waitForTimeout(200);

    // 5. Play through level 1 (60 swap attempts)
    for (let i = 0; i < swaps.length; i++) {
      const [r1, c1, r2, c2] = swaps[i];
      await swapTiles(page, r1, c1, r2, c2, LK);
    }
    await page.screenshot({ path: "e2e/screenshots/match-05-gameplay.png" });

    // 6. Check for and handle overlays
    await page.waitForTimeout(500);
    // Level complete Continue
    await clickGameCoord(page, 400, 380);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/match-06-after-overlay.png" });

    // Question answer (in case question appeared)
    await clickGameCoord(page, 400, 230);
    await page.waitForTimeout(1000);
    // Feedback continue
    await clickGameCoord(page, 400, 430);
    await page.waitForTimeout(1500);
    // Game over retry
    await clickGameCoord(page, 400, 340);
    await page.waitForTimeout(1500);

    // 7. More gameplay
    for (let i = 0; i < 30; i++) {
      const [r1, c1, r2, c2] = swaps[i % swaps.length];
      await swapTiles(page, r1, c1, r2, c2, LK);
    }
    await page.screenshot({ path: "e2e/screenshots/match-07-more-gameplay.png" });

    // Handle overlays again
    await clickGameCoord(page, 400, 380);
    await page.waitForTimeout(1000);
    await clickGameCoord(page, 400, 230);
    await page.waitForTimeout(1000);
    await clickGameCoord(page, 400, 430);
    await page.waitForTimeout(1000);
    await clickGameCoord(page, 400, 340);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "e2e/screenshots/match-08-final.png" });

    // 8. Big kids mode
    await page.goto("/");
    await page.waitForSelector(".landing-lesson-title", { timeout: 10000 });
    const bk = page.locator("text=Big Kids");
    if (await bk.isVisible()) await bk.click();
    await page.waitForTimeout(500);
    await page.goto("/#/games/match");
    await waitForCanvas(page);
    await clickGameCoord(page, 400, 480);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/screenshots/match-09-bk-grid.png" });

    // 9. Back button
    await expect(page.locator("text=Back to Games")).toBeVisible();
  });
});
