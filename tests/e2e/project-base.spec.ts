import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";

// Acceptance tests for the "project base" story: email/password sign-in,
// the protected placeholder home page, sign-out, and sign-up being blocked.
// All tests run at 375px (the "mobile" project in playwright.config.ts).

const SIGNED_OUT = { cookies: [], origins: [] };
const WRONG_CREDENTIALS_MESSAGE = "Wrong email or password.";

function testUser(): { email: string; password: string } {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env");
  }
  return { email, password };
}

async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function expectOnSignInPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Office Snack Tracker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

// Next.js also renders a hidden role="alert" route announcer, so match the
// form's alert by its text rather than taking the only alert on the page.
async function expectWrongCredentialsError(page: Page): Promise<void> {
  await expect(
    page.getByRole("alert").filter({ hasText: WRONG_CREDENTIALS_MESSAGE }),
  ).toBeVisible();
  await expect(page.getByText(WRONG_CREDENTIALS_MESSAGE)).toHaveText(WRONG_CREDENTIALS_MESSAGE);
}

async function expectProtectedPageBlocked(page: Page): Promise<void> {
  await page.goto("/");
  await expectOnSignInPage(page);
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toHaveCount(0);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(clientWidth).toBe(375);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe("Project base: sign in to the Office Snack Tracker", () => {
  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });

    test("AC1: the seeded test user signs in with email and password and lands on a protected page", async ({
      page,
    }) => {
      const { email, password } = testUser();
      await page.goto("/sign-in");
      await submitSignIn(page, email, password);

      await page.waitForURL("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

      // Still signed in on a fresh load of the protected page.
      await page.reload();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeVisible();
    });

    test("AC7: a visitor who is not signed in is sent to the sign-in page from any other page", async ({
      page,
    }) => {
      for (const path of ["/", "/items", "/shopping-list", "/some/unknown/page"]) {
        await page.goto(path);
        await expectOnSignInPage(page);
      }
    });

    test("AC8: a visitor who is not signed in can open the sign-in page without a redirect", async ({
      page,
    }) => {
      const response = await page.goto("/sign-in");
      expect(response?.status()).toBe(200);
      // No redirect happened on the way to this response.
      expect(response?.request().redirectedFrom()).toBeNull();
      await expectOnSignInPage(page);
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
    });

    test("AC9: a wrong password keeps the user on sign-in, not signed in, with an error message", async ({
      page,
    }) => {
      const { email } = testUser();
      await page.goto("/sign-in");
      await submitSignIn(page, email, "definitely-not-the-password-123");

      await expectWrongCredentialsError(page);
      await expectOnSignInPage(page);
      await expectProtectedPageBlocked(page);
    });

    test("AC10: an unknown email keeps the user on sign-in, not signed in, with an error message", async ({
      page,
    }) => {
      await page.goto("/sign-in");
      await submitSignIn(page, "nobody@example.com", "any-password-123");

      // Same generic message as a wrong password (answer 4).
      await expectWrongCredentialsError(page);
      await expectOnSignInPage(page);
      await expectProtectedPageBlocked(page);
    });

    test("AC11: submitting with the email or the password empty shows a required message and does not sign in", async ({
      page,
    }) => {
      const { email, password } = testUser();
      await page.goto("/sign-in");

      // Email empty, password filled.
      await submitSignIn(page, "", password);
      await expect(page.getByText("Email is required")).toBeVisible();
      await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
      await expectOnSignInPage(page);

      // Password empty, email filled.
      await page.goto("/sign-in");
      await submitSignIn(page, email, "");
      await expect(page.getByText("Password is required")).toBeVisible();
      await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
      await expectOnSignInPage(page);

      // Both empty.
      await page.goto("/sign-in");
      await submitSignIn(page, "", "");
      await expect(page.getByText("Email is required")).toBeVisible();
      await expect(page.getByText("Password is required")).toBeVisible();
      await expectOnSignInPage(page);

      await expectProtectedPageBlocked(page);
    });

    test("AC12: no way to create an account is offered, and a registration attempt is refused with no user created", async ({
      page,
      request,
      baseURL,
    }) => {
      await page.goto("/sign-in");
      await expectOnSignInPage(page);
      const signUpWording = /sign ?up|register|create (an )?account|new account|join/i;
      await expect(page.getByRole("link", { name: signUpWording })).toHaveCount(0);
      await expect(page.getByRole("button", { name: signUpWording })).toHaveCount(0);
      await expect(page.getByText(signUpWording)).toHaveCount(0);

      // A direct registration attempt against the auth endpoint, sent as the
      // browser would (same Origin), so it is refused for the right reason.
      const newEmail = `e2e-signup-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
      const newPassword = "a-strong-password-123";
      const response = await request.post("/api/auth/sign-up/email", {
        headers: { Origin: baseURL ?? "http://localhost:3000" },
        data: { name: "Someone New", email: newEmail, password: newPassword },
      });
      expect(response.ok(), `sign-up returned ${response.status()}`).toBe(false);
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);

      // No user was created: those credentials cannot sign in.
      await page.goto("/sign-in");
      await submitSignIn(page, newEmail, newPassword);
      await expectWrongCredentialsError(page);
      await expectProtectedPageBlocked(page);
    });

    test("Answer 2: signing out returns to sign-in and protected pages are blocked again", async ({
      page,
    }) => {
      // Fresh sign-in in its own context so the shared session is not ended.
      const { email, password } = testUser();
      await page.goto("/sign-in");
      await submitSignIn(page, email, password);
      await page.waitForURL("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeVisible();

      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL(/\/sign-in$/);
      await expectOnSignInPage(page);
      await expectProtectedPageBlocked(page);
    });

    test("Answer 7: the email is matched case-insensitively at sign-in", async ({ page }) => {
      const { email, password } = testUser();
      await page.goto("/sign-in");
      await submitSignIn(page, email.toUpperCase(), password);
      await page.waitForURL("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeVisible();
    });

    test("Edge case: a forged session cookie is treated as not signed in", async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        {
          name: "better-auth.session_token",
          value: "forged-token.forged-signature",
          url: baseURL ?? "http://localhost:3000",
        },
      ]);
      await page.goto("/");
      await expectOnSignInPage(page);
      await expect(page.getByRole("heading", { name: /Welcome,/ })).toHaveCount(0);
    });

    test("Edge case 375px: the sign-in page shows all content without horizontal scrolling", async ({
      page,
    }) => {
      await page.goto("/sign-in");
      await expectOnSignInPage(page);
      await expect(page.getByText("Sign in to continue")).toBeInViewport();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe("signed in (shared session from auth.setup)", () => {
    test("AC2: a signed-in user opens a page other than sign-in and is not sent to sign-in", async ({
      page,
    }) => {
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeVisible();
      await expect(page.getByText("Items are coming soon.")).toBeVisible();
    });

    test("Answer 3: a signed-in user who opens the sign-in page is sent to the home page", async ({
      page,
    }) => {
      await page.goto("/sign-in");
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeVisible();
    });

    test("Edge case 375px: the protected home page shows all content without horizontal scrolling", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Welcome, Test User" })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
      await expectNoHorizontalScroll(page);
    });
  });
});
