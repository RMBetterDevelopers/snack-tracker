import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Runs once before the `node` Vitest project.
// 1. Refuses to run unless the tests point at a separate test database,
//    because tests truncate every table.
// 2. Applies all migrations to the test database.
export default function globalSetup(project: TestProject): void {
  // vitest.config.ts puts the test env (DATABASE_URL = TEST_DATABASE_URL,
  // DEV_DATABASE_URL = the dev URL) on the project config.
  const env = { ...process.env, ...project.config.env };
  const testUrl = env.TEST_DATABASE_URL;
  const devUrl = env.DEV_DATABASE_URL;

  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is not set. Add it to .env (see .env.example).");
  }
  if (testUrl === devUrl) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL. Tests would wipe the dev database.");
  }
  if (env.DATABASE_URL !== testUrl) {
    throw new Error("DATABASE_URL in the test environment must equal TEST_DATABASE_URL.");
  }

  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
