import "dotenv/config";
import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE_PATH } from "../../playwright.config";

// Signs in once as the seeded test user through the real UI and saves the
// session cookie, so specs start signed in. Signed-out specs override
// storageState with an empty state.
setup("sign in as the seeded test user", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env");
  }

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("/");
  // By heading role: Next's hidden route announcer repeats the heading text.
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
