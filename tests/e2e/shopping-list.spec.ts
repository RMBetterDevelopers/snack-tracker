import "dotenv/config";
import { randomBytes } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { ItemCategory, ItemStatus } from "../../generated/prisma/client";
import { createPrismaClient } from "../../lib/create-prisma-client";

// Acceptance tests for the "Shopping list and Mark as bought" story.
// All tests run at 375px (the "mobile" project in playwright.config.ts) and
// start signed in as the seeded test user, unless they override storageState.
//
// Test data (story answer 9): flagging is not built yet, so each test creates
// its own uniquely named item directly in the dev database and archives it at
// the end. The database is used ONLY to arrange state and to clean up. Every
// assertion is made on what the user sees in the browser.
//
// Criteria with no test here, because nothing on screen shows what they
// require (see the verifier report): AC7, AC8, AC15, AC19, AC20, AC21, AC22,
// AC23. They are covered by the Vitest data-access and action tests.

const SIGNED_OUT = { cookies: [], origins: [] };
const REFRESH_MESSAGE = "Couldn't mark as bought. Please refresh.";
const SIGN_IN_AGAIN_MESSAGE = "Please sign in again.";

type TestItem = { id: string; name: string };
type NewItem = { label: string; status: ItemStatus; category?: ItemCategory; archived?: boolean };
type TestData = {
  createItem: (item: NewItem) => Promise<TestItem>;
  archiveItem: (id: string) => Promise<void>;
};

function uniqueName(label: string): string {
  return `E2E ${label} ${Date.now()}-${randomBytes(3).toString("hex")}`;
}

const test = base.extend<{ testData: TestData }>({
  // Playwright fixtures need an object pattern for the (unused) fixture arguments.
  testData: async ({}, provide) => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be set in .env");
    }
    const db = createPrismaClient(connectionString);
    const createdIds: string[] = [];

    await provide({
      createItem: async ({ label, status, category = "OTHER", archived = false }) => {
        const name = uniqueName(label);
        const item = await db.item.create({
          data: { name, status, category, archived },
          select: { id: true, name: true },
        });
        createdIds.push(item.id);
        return item;
      },
      archiveItem: async (id) => {
        await db.item.update({ where: { id }, data: { archived: true } });
      },
    });

    // Answer 9: archive (never delete) every item this test created.
    await db.item.updateMany({ where: { id: { in: createdIds } }, data: { archived: true } });
    await db.$disconnect();
  },
});

async function openShoppingList(page: Page): Promise<void> {
  await page.goto("/shopping-list");
  await expect(page.getByRole("heading", { level: 1, name: "Shopping list" })).toBeVisible();
}

function row(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({ hasText: name });
}

async function backgroundColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(clientWidth).toBe(375);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

// Simulates a tampered request from the browser: the user taps Bought once,
// and the outgoing Mark as bought request carries a different itemId (as anyone
// could send with dev tools). The request body is rewritten on its way out, so
// the test does not race React hydration by editing the hidden field.
async function tapBoughtWithItemId(
  page: Page,
  itemRow: Locator,
  realItemId: string,
  sentItemId: string,
): Promise<void> {
  let rewritten = 0;
  await page.route("**/shopping-list", async (route) => {
    const request = route.request();
    const body = request.postData();
    if (request.method() !== "POST" || body === null || !body.includes(realItemId)) {
      await route.continue();
      return;
    }
    rewritten += 1;
    await route.continue({ postData: body.split(realItemId).join(sentItemId) });
  });

  await itemRow.getByRole("button", { name: "Bought" }).click();
  await expect.poll(() => rewritten, { message: "the Bought request was sent and rewritten" }).toBe(1);
  await page.unrouteAll({ behavior: "wait" });
}

test.describe("Shopping list and Mark as bought", () => {
  test("AC1: a non-archived RUNNING_LOW item appears on the shopping list", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Oat milk", status: "RUNNING_LOW", category: "COFFEE" });

    await openShoppingList(page);

    await expect(row(page, item.name)).toHaveCount(1);
    await expect(row(page, item.name)).toBeVisible();
  });

  test("AC2: a non-archived OUT item appears on the shopping list", async ({ page, testData }) => {
    const item = await testData.createItem({ label: "Coca-Cola Zero", status: "OUT", category: "SODA" });

    // Reached through the header link (answer 6).
    await page.goto("/");
    await page.getByRole("link", { name: "Shopping list" }).click();
    await expect(page).toHaveURL(/\/shopping-list$/);

    await expect(row(page, item.name)).toHaveCount(1);
    await expect(row(page, item.name)).toBeVisible();
  });

  test("AC3: a RUNNING_LOW item shows a 'Running low' text label as well as a color", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Running low label", status: "RUNNING_LOW" });

    await openShoppingList(page);

    const label = row(page, item.name).getByText("Running low", { exact: true });
    await expect(label).toBeVisible();
    expect(await backgroundColor(label)).not.toBe(TRANSPARENT);
  });

  test("AC4: an OUT item shows an 'Out' text label and a color, both different from RUNNING_LOW", async ({
    page,
    testData,
  }) => {
    const out = await testData.createItem({ label: "Out label", status: "OUT" });
    const low = await testData.createItem({ label: "Low label", status: "RUNNING_LOW" });

    await openShoppingList(page);

    const outLabel = row(page, out.name).getByText("Out", { exact: true });
    const lowLabel = row(page, low.name).getByText("Running low", { exact: true });
    await expect(outLabel).toBeVisible();
    await expect(lowLabel).toBeVisible();

    // Text labels differ.
    expect(await outLabel.textContent()).not.toBe(await lowLabel.textContent());
    // Both have a color, and the colors differ.
    const outColor = await backgroundColor(outLabel);
    const lowColor = await backgroundColor(lowLabel);
    expect(outColor).not.toBe(TRANSPARENT);
    expect(lowColor).not.toBe(TRANSPARENT);
    expect(outColor).not.toBe(lowColor);
    // The OUT row does not also show the RUNNING_LOW label.
    await expect(row(page, out.name).getByText("Running low", { exact: true })).toHaveCount(0);
  });

  // Observable part only: one tap, no form or confirmation, the item leaves the
  // flagged list and stays gone after a reload. That the status is exactly
  // IN_STOCK (not archived or deleted) is not visible anywhere in the UI.
  test("AC5: one tap on Bought for a RUNNING_LOW item, with no form or confirmation step", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Buy running low", status: "RUNNING_LOW" });
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await openShoppingList(page);
    const itemRow = row(page, item.name);
    await expect(itemRow.getByText("Running low", { exact: true })).toBeVisible();
    // The row has no visible input fields: the button is the only control.
    await expect(itemRow.getByRole("textbox")).toHaveCount(0);

    await itemRow.getByRole("button", { name: "Bought" }).click();

    await expect(itemRow).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Shopping list" })).toBeVisible();
    await expect(row(page, item.name)).toHaveCount(0);
  });

  // Observable part only, as for AC5.
  test("AC6: one tap on Bought for an OUT item takes it off the flagged list", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Buy out", status: "OUT", category: "SODA" });

    await openShoppingList(page);
    const itemRow = row(page, item.name);
    await expect(itemRow.getByText("Out", { exact: true })).toBeVisible();

    await itemRow.getByRole("button", { name: "Bought" }).click();

    await expect(itemRow).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Shopping list" })).toBeVisible();
    await expect(row(page, item.name)).toHaveCount(0);
  });

  test("AC9: a bought item disappears from the list without a page reload", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "No reload", status: "OUT" });

    await openShoppingList(page);
    // A marker on window survives client-side updates but not a full reload.
    await page.evaluate(() => {
      (window as unknown as { e2eNoReload?: boolean }).e2eNoReload = true;
    });

    await row(page, item.name).getByRole("button", { name: "Bought" }).click();

    await expect(row(page, item.name)).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
    ).toBe(true);
    await expect(page).toHaveURL(/\/shopping-list$/);
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });

    test("AC10: a visitor who is not signed in is redirected to sign-in and sees no items", async ({
      page,
      testData,
    }) => {
      const item = await testData.createItem({ label: "Signed out", status: "OUT" });

      await page.goto("/shopping-list");

      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await expect(page.getByText(item.name)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Bought" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Shopping list" })).toHaveCount(0);
    });
  });

  // Observable part only: the request is rejected and the item is still OUT.
  // Whether a status change was recorded is not visible in the UI.
  test("AC11: Mark as bought without a session is rejected and the item stays OUT", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "No session", status: "OUT" });

    await openShoppingList(page);
    const cookies = await page.context().cookies();
    await page.context().clearCookies();

    await row(page, item.name).getByRole("button", { name: "Bought" }).click();

    // Rejected with the inline message (answer 2, brief amendment 1: proxy.ts
    // lets Server Action requests through, so the action answers UNAUTHENTICATED).
    const itemRow = row(page, item.name);
    await expect(itemRow.getByRole("alert")).toHaveText(SIGN_IN_AGAIN_MESSAGE);
    await expect(itemRow.getByRole("button", { name: "Bought" })).toBeEnabled();
    await expect(page).toHaveURL(/\/shopping-list$/);

    // Sign back in (restore the session) and check the item is still flagged OUT.
    await page.context().addCookies(cookies);
    await openShoppingList(page);
    await expect(row(page, item.name)).toHaveCount(1);
    await expect(row(page, item.name).getByText("Out", { exact: true })).toBeVisible();
  });

  // Observable part only: rejected with an error, and the item keeps its status.
  test("AC12: Mark as bought with a missing or malformed item id is rejected", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Bad id", status: "RUNNING_LOW" });

    for (const badId of ["", "not a cuid!"]) {
      await openShoppingList(page);
      const itemRow = row(page, item.name);

      await tapBoughtWithItemId(page, itemRow, item.id, badId);

      await expect(itemRow.getByRole("alert")).toHaveText(REFRESH_MESSAGE);
      await expect(itemRow.getByRole("button", { name: "Bought" })).toBeEnabled();
      await expect(itemRow.getByText("Running low", { exact: true })).toBeVisible();
    }

    await openShoppingList(page);
    await expect(row(page, item.name)).toHaveCount(1);
    await expect(row(page, item.name).getByText("Running low", { exact: true })).toBeVisible();
  });

  // Observable part only: rejected with an error.
  test("AC13: Mark as bought for an item id that does not exist is rejected", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Missing id", status: "OUT" });
    // A well-formed cuid that no item has.
    const unknownId = `c${randomBytes(12).toString("hex")}`;

    await openShoppingList(page);
    const itemRow = row(page, item.name);

    await tapBoughtWithItemId(page, itemRow, item.id, unknownId);

    await expect(itemRow.getByRole("alert")).toHaveText(REFRESH_MESSAGE);
    await expect(itemRow.getByRole("button", { name: "Bought" })).toBeEnabled();

    // The item whose row was used is untouched.
    await openShoppingList(page);
    await expect(row(page, item.name).getByText("Out", { exact: true })).toBeVisible();
  });

  // Observable part only: rejected with an error. The archived item's status is
  // not shown anywhere, so "stays OUT" cannot be seen.
  test("AC14: Mark as bought for an archived OUT item is rejected", async ({ page, testData }) => {
    const item = await testData.createItem({ label: "Archived later", status: "OUT" });

    await openShoppingList(page);
    const itemRow = row(page, item.name);
    await expect(itemRow).toBeVisible();

    // Someone archives the item after the page loaded (story edge case).
    await testData.archiveItem(item.id);

    await itemRow.getByRole("button", { name: "Bought" }).click();

    await expect(itemRow.getByRole("alert")).toHaveText(REFRESH_MESSAGE);
    await expect(itemRow.getByRole("button", { name: "Bought" })).toBeEnabled();
  });

  test("AC16: IN_STOCK items do not appear on the shopping list", async ({ page, testData }) => {
    const inStock = await testData.createItem({ label: "In stock", status: "IN_STOCK" });
    const flagged = await testData.createItem({ label: "Flagged control", status: "OUT" });

    await openShoppingList(page);

    // The list has loaded (the flagged control item is there).
    await expect(row(page, flagged.name)).toBeVisible();
    await expect(page.getByText(inStock.name)).toHaveCount(0);
    await expect(page.getByText("In stock", { exact: true })).toHaveCount(0);
  });

  test("AC17: archived RUNNING_LOW and OUT items do not appear on the shopping list", async ({
    page,
    testData,
  }) => {
    const archivedLow = await testData.createItem({
      label: "Archived low",
      status: "RUNNING_LOW",
      archived: true,
    });
    const archivedOut = await testData.createItem({ label: "Archived out", status: "OUT", archived: true });
    const flagged = await testData.createItem({ label: "Flagged control", status: "RUNNING_LOW" });

    await openShoppingList(page);

    await expect(row(page, flagged.name)).toBeVisible();
    await expect(page.getByText(archivedLow.name)).toHaveCount(0);
    await expect(page.getByText(archivedOut.name)).toHaveCount(0);
  });

  test("AC18: flagged items from every category appear on the shopping list", async ({
    page,
    testData,
  }) => {
    const cases = [
      { category: "SNACK", label: "Snack", status: "RUNNING_LOW" },
      { category: "COFFEE", label: "Coffee", status: "OUT" },
      { category: "SODA", label: "Soda", status: "RUNNING_LOW" },
      { category: "OTHER", label: "Other", status: "OUT" },
    ] as const;
    const created = [];
    for (const c of cases) {
      created.push({
        ...c,
        item: await testData.createItem({ label: `Category ${c.label}`, status: c.status, category: c.category }),
      });
    }

    await openShoppingList(page);

    for (const { item, label } of created) {
      const itemRow = row(page, item.name);
      await expect(itemRow).toHaveCount(1);
      await expect(itemRow.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("AC24: at 375px the list has no horizontal scroll and every Bought control can be tapped", async ({
    page,
    testData,
  }) => {
    const longName = await testData.createItem({
      label: `Long name ${"Extra-creamy barista oat milk family pack ".repeat(3)}`,
      status: "RUNNING_LOW",
    });
    await testData.createItem({ label: "Short", status: "OUT" });

    await openShoppingList(page);

    const longRow = row(page, longName.name);
    await expect(longRow).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The long name wraps rather than being cut off (answer 8).
    await expect(longRow.getByText(longName.name)).toBeVisible();

    const buttons = page.getByRole("button", { name: "Bought" });
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      await expect(button).toBeEnabled();
      // Actionability check (visible, stable, receives the pointer) without tapping.
      await button.click({ trial: true });
    }
    await expectNoHorizontalScroll(page);
  });
});
