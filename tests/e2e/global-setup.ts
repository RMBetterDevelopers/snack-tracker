import { execSync } from "node:child_process";

// Seeds the dev database before the e2e run, so the test user and items exist.
// The seed is idempotent, so running it every time is safe.
export default function globalSetup(): void {
  execSync("pnpm prisma db seed", { stdio: "inherit" });
}
