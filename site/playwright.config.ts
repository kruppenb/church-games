import { defineConfig, devices } from "@playwright/test";

/**
 * `NodeJS.ProcessEnv` types every value as `string | undefined`, but
 * Playwright's `webServer.env` wants `Record<string, string>` — filter out
 * the `undefined`s instead of casting so this stays type-safe.
 */
function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }
  out.VITE_LEADERBOARD_API = "/__lb-api";
  return out;
}

export default defineConfig({
  testDir: "./e2e",
  // Phaser boot + full playthroughs regularly exceed the default 30s when
  // all projects run in parallel locally; 60s keeps load-induced flakes out.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Locally, cap the browser count: the default (half the cores) floods the
  // single dev server and starves lesson fetches / Phaser boots, making
  // slow-loading tests fail at random.
  workers: process.env.CI ? 1 : 6,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: process.env.CI ? "only-on-failure" : "on",
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "iPhone 12",
      use: { ...devices["iPhone 12"] },
    },
    {
      name: "iPad",
      use: {
        ...devices["iPad (gen 7)"],
        viewport: { width: 810, height: 1080 },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    // VITE_LEADERBOARD_API points the client at a same-origin mock API base
    // (`/__lb-api`) so leaderboard e2e specs never need CORS — they intercept
    // it with page.route(). IMPORTANT: if a dev server is already running
    // (e.g. `npm run dev` started by hand) it gets reused as-is via
    // reuseExistingServer above, and this env var has NO effect on it — stop
    // that server and let Playwright start its own, or leaderboard.spec.ts
    // will fail fast with a hint.
    env: definedEnv(process.env),
  },
});
