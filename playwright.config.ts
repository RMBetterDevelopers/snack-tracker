import "dotenv/config";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const AUTH_STATE_PATH = "playwright/.auth/user.json";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: "mobile",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        viewport: { width: 375, height: 812 },
        storageState: AUTH_STATE_PATH,
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
