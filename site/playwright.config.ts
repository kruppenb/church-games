import { defineConfig, devices } from "@playwright/test";

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
  },
});
