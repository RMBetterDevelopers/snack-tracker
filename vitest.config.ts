import path from "node:path";
import react from "@vitejs/plugin-react";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

// Read .env without touching process.env; process.env wins (e.g. in CI).
const parsed = loadDotenv({ path: path.join(root, ".env"), processEnv: {}, quiet: true }).parsed ?? {};
const fileEnv: Record<string, string | undefined> = { ...parsed, ...process.env };

// Data-access and seed tests must hit the separate test database, never the dev one.
// tests/global-setup.ts refuses to run if TEST_DATABASE_URL is missing or equals DATABASE_URL.
const testEnv: Record<string, string> = {
  ...fileEnv,
  DEV_DATABASE_URL: fileEnv.DATABASE_URL ?? "",
  DATABASE_URL: fileEnv.TEST_DATABASE_URL ?? "",
};

const sharedAlias = {
  "@": root,
  // `server-only` throws outside a React Server Components bundle; in tests it is a no-op.
  "server-only": path.join(root, "tests/stubs/server-only.ts"),
};

export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["features/**/*.test.ts", "lib/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["tests/e2e/**", "node_modules/**"],
          globals: true,
          env: testEnv,
          globalSetup: ["tests/global-setup.ts"],
          // All DB tests share one test database, so run files one at a time.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          exclude: ["node_modules/**", "tests/e2e/**"],
          globals: true,
          setupFiles: ["tests/setup-dom.ts"],
        },
      },
    ],
  },
});
