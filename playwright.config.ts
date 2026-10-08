import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox-critical",
      grep: /@critical/,
      use: {
        ...devices["Desktop Firefox"],
        video: "off",
        launchOptions: {
          env: { MOZ_DISABLE_CONTENT_SANDBOX: "1" },
          firefoxUserPrefs: { "security.sandbox.content.level": 0 },
        },
      },
    },
    { name: "webkit-critical", grep: /@critical/, use: { ...devices["Desktop Safari"] } },
  ],
});
