import "dotenv/config";
import { randomBytes } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { ItemCategory, ItemStatus } from "../../generated/prisma/client";
import { createPrismaClient } from "../../lib/create-prisma-client";

// Acceptance tests for the "Item status change history on the item detail page"
// story. All tests run at 375px (the "mobile" project in playwright.config.ts)
// and start signed in as the seeded test user, unless they override storageState.
//
// Test data: flagging is a companion story that has not shipped, so (as the story
// allows) each test arranges its own uniquely named item and "prepared" status
// changes directly in the dev database. The database is used ONLY to arrange
// state and to clean up. Status change rows are only inserted, never updated or
// deleted (append-only). Items are archived at the end, never deleted. Every
// assertion is made on what the user sees in the browser.
//
// Prepared status changes are made by the seeded "Test User", because that is
// the only user the dev seed has. A second user (e.g. "Anna") cannot be removed
// again (user FK is RESTRICT), so AC12 has no test here (see the verifier report).

const SIGNED_OUT = { cookies: [], origins: [] };
const TEST_USER_NAME = "Test User";
const NOT_FOUND_TEXT = "This page could not be found.";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type TestItem = { id: string; name: string };
type NewItem = { label: string; status: ItemStatus; category?: ItemCategory; archived?: boolean };
type NewStatusChange = {
  itemId: string;
  oldStatus: ItemStatus;
  newStatus: ItemStatus;
  // How long before "now" the change happened.
  ago: number;
};
type TestData = {
  createItem: (item: NewItem) => Promise<TestItem>;
  addStatusChange: (change: NewStatusChange) => Promise<void>;
};

function uniqueName(label: string): string {
  return `E2E ${label} ${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function testUserEmail(): string {
  const email = process.env.TEST_USER_EMAIL;
  if (!email) {
    throw new Error("TEST_USER_EMAIL must be set in .env");
  }
  return email.toLowerCase();
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

    const testUser = await db.user.findFirst({
      where: { email: testUserEmail() },
      select: { id: true },
    });
    if (!testUser) {
      throw new Error("The seeded test user was not found. Run `pnpm prisma db seed`.");
    }

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
      addStatusChange: async ({ itemId, oldStatus, newStatus, ago }) => {
        await db.statusChange.create({
          data: {
            itemId,
            oldStatus,
            newStatus,
            userId: testUser.id,
            createdAt: new Date(Date.now() - ago),
          },
        });
      },
    });

    // Archive (never delete) every item this test created.
    await db.item.updateMany({ where: { id: { in: createdIds } }, data: { archived: true } });
    await db.$disconnect();
  },
});

async function openItem(page: Page, item: TestItem): Promise<void> {
  await page.goto(`/items/${item.id}`);
  // By heading role: Next's hidden route announcer repeats the heading text.
  await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "History" })).toBeVisible();
}

function historyList(page: Page): Locator {
  return page.getByRole("list", { name: "History" });
}

function historyEntries(page: Page): Locator {
  return historyList(page).getByRole("listitem");
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

// A well-formed cuid that no item has.
function unknownCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

test.describe("Item status change history on the item detail page", () => {
  test('AC1: the item detail page shows the item name "Oat milk"', async ({ page, testData }) => {
    const item = await testData.createItem({ label: "Oat milk", status: "IN_STOCK", category: "COFFEE" });

    await page.goto(`/items/${item.id}`);

    await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: item.name })).toHaveText(item.name);
  });

  test("AC2: an IN_STOCK -> RUNNING_LOW change from 2 days ago reads 'Flagged running low by <name>, 2 days ago'", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Oat milk", status: "RUNNING_LOW", category: "COFFEE" });
    // 2 days and 1 hour, so it stays "2 days ago" however long the test takes.
    await testData.addStatusChange({
      itemId: item.id,
      oldStatus: "IN_STOCK",
      newStatus: "RUNNING_LOW",
      ago: 2 * DAY + HOUR,
    });

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toHaveText(
      `Flagged running low by ${TEST_USER_NAME}, 2 days ago`,
    );
    // Decision 2: entries do not repeat the item name.
    await expect(historyEntries(page).first()).not.toContainText(item.name);
  });

  test("AC3: an IN_STOCK -> OUT change shows one entry naming the user and giving the relative time", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Flagged out", status: "OUT" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "OUT", ago: 3 * HOUR + 5 * MINUTE });

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toHaveText(`Flagged out by ${TEST_USER_NAME}, 3 hours ago`);
  });

  test("AC4: a RUNNING_LOW -> IN_STOCK (Mark as bought) change shows one entry naming 'Test User' and giving the relative time", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Bought earlier", status: "IN_STOCK" });
    await testData.addStatusChange({
      itemId: item.id,
      oldStatus: "RUNNING_LOW",
      newStatus: "IN_STOCK",
      ago: 1 * DAY + HOUR,
    });

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toHaveText(`Marked as bought by ${TEST_USER_NAME}, 1 day ago`);
  });

  test("AC5: after tapping Bought on the shopping list, the item's history has a new 'just now' entry by Test User", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Oat milk", status: "RUNNING_LOW", category: "COFFEE" });

    // Before: no history.
    await openItem(page, item);
    await expect(page.getByText("No history yet.")).toBeVisible();

    await page.goto("/shopping-list");
    const itemRow = page.getByRole("listitem").filter({ hasText: item.name });
    await expect(itemRow).toHaveCount(1);
    await itemRow.getByRole("button", { name: "Bought" }).click();
    await expect(itemRow).toHaveCount(0);

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(1);
    await expect(historyEntries(page).first()).toHaveText(`Marked as bought by ${TEST_USER_NAME}, just now`);
    // The current status badge reflects the purchase too.
    await expect(page.getByText("In stock", { exact: true })).toBeVisible();
  });

  test("AC6: an item with 3 status changes shows 3 history entries", async ({ page, testData }) => {
    const item = await testData.createItem({ label: "Three changes", status: "IN_STOCK" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 3 * DAY + HOUR });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "RUNNING_LOW", newStatus: "OUT", ago: 2 * DAY + HOUR });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "OUT", newStatus: "IN_STOCK", ago: 1 * DAY + HOUR });

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(3);
    await expect(historyEntries(page)).toHaveText([
      `Marked as bought by ${TEST_USER_NAME}, 1 day ago`,
      `Flagged out by ${TEST_USER_NAME}, 2 days ago`,
      `Flagged running low by ${TEST_USER_NAME}, 3 days ago`,
    ]);
  });

  test("AC7: an item's history shows only its own status changes, not another item's", async ({
    page,
    testData,
  }) => {
    const oatMilk = await testData.createItem({ label: "Oat milk", status: "IN_STOCK", category: "COFFEE" });
    const cola = await testData.createItem({ label: "Coca-Cola Zero", status: "OUT", category: "SODA" });
    await testData.addStatusChange({ itemId: oatMilk.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 2 * DAY + HOUR });
    await testData.addStatusChange({ itemId: oatMilk.id, oldStatus: "RUNNING_LOW", newStatus: "IN_STOCK", ago: 1 * DAY + HOUR });
    // Distinctive: the only OUT change, and 5 days old.
    await testData.addStatusChange({ itemId: cola.id, oldStatus: "IN_STOCK", newStatus: "OUT", ago: 5 * DAY + HOUR });

    await openItem(page, oatMilk);

    await expect(historyEntries(page)).toHaveCount(2);
    await expect(historyEntries(page)).toHaveText([
      `Marked as bought by ${TEST_USER_NAME}, 1 day ago`,
      `Flagged running low by ${TEST_USER_NAME}, 2 days ago`,
    ]);
    await expect(historyList(page).getByText(/Flagged out/)).toHaveCount(0);
    await expect(historyList(page).getByText(/5 days ago/)).toHaveCount(0);
    await expect(page.getByText(cola.name)).toHaveCount(0);

    // Control: the other item's change is shown on its own page.
    await openItem(page, cola);
    await expect(historyEntries(page)).toHaveText([`Flagged out by ${TEST_USER_NAME}, 5 days ago`]);
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });

    test("AC8: a visitor who is not signed in is sent to sign-in and sees no item name and no history", async ({
      page,
      testData,
    }) => {
      const item = await testData.createItem({ label: "Signed out", status: "RUNNING_LOW" });
      await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 2 * DAY + HOUR });

      await page.goto(`/items/${item.id}`);

      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await expect(page.getByText(item.name)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "History" })).toHaveCount(0);
      await expect(page.getByText(/Flagged running low/)).toHaveCount(0);
    });
  });

  test("AC9: a malformed item id shows the not-found page with no item and no history", async ({ page }) => {
    for (const badId of ["not-a-cuid", "not%20a%20cuid!", "123"]) {
      await page.goto(`/items/${badId}`);

      await expect(page.getByText(NOT_FOUND_TEXT)).toBeVisible();
      await expect(page.getByRole("heading", { name: "History" })).toHaveCount(0);
      await expect(page.getByRole("list", { name: "History" })).toHaveCount(0);
      await expect(page.getByText("No history yet.")).toHaveCount(0);
    }
  });

  test("AC10: an item id that matches no item shows the not-found page with no item and no history", async ({
    page,
  }) => {
    await page.goto(`/items/${unknownCuid()}`);

    await expect(page.getByText(NOT_FOUND_TEXT)).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "History" })).toHaveCount(0);
    await expect(page.getByText("No history yet.")).toHaveCount(0);
  });

  test("AC11: an archived item with status changes shows its page, an 'Archived' note and its history", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Archived", status: "OUT", archived: true });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "OUT", ago: 2 * DAY + HOUR });

    await openItem(page, item);

    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await expect(historyEntries(page)).toHaveText([`Flagged out by ${TEST_USER_NAME}, 2 days ago`]);
  });

  test("AC13: no history entry shows a user's email address, only the user's name", async ({
    page,
    testData,
  }) => {
    const email = testUserEmail();
    const item = await testData.createItem({ label: "No email", status: "IN_STOCK" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 2 * DAY + HOUR });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "RUNNING_LOW", newStatus: "IN_STOCK", ago: HOUR + MINUTE });

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(2);
    for (const entry of await historyEntries(page).all()) {
      await expect(entry).toContainText(`by ${TEST_USER_NAME},`);
      // Neither the visible text nor any attribute (e.g. the title tooltip) has the email.
      expect((await entry.innerText()).toLowerCase()).not.toContain(email);
      expect((await entry.innerHTML()).toLowerCase()).not.toContain(email);
    }
    const historySection = page.locator("section", { has: page.getByRole("heading", { name: "History" }) });
    expect((await historySection.innerHTML()).toLowerCase()).not.toContain(email);
    expect((await page.locator("main, body").first().innerText()).toLowerCase()).not.toContain(email);
  });

  test("AC14: opening the page 3 times leaves the item with exactly its 2 status changes", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Viewed thrice", status: "IN_STOCK" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "OUT", ago: 2 * DAY + HOUR });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "OUT", newStatus: "IN_STOCK", ago: 1 * DAY + HOUR });
    const expected = [
      `Marked as bought by ${TEST_USER_NAME}, 1 day ago`,
      `Flagged out by ${TEST_USER_NAME}, 2 days ago`,
    ];

    for (let view = 1; view <= 3; view += 1) {
      await openItem(page, item);
      await expect(historyEntries(page)).toHaveText(expected);
    }
    // A plain refresh does not add entries either.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
    await expect(historyEntries(page)).toHaveText(expected);
  });

  test("AC15: the status shown with a color also has its text label", async ({ page, testData }) => {
    const item = await testData.createItem({ label: "Badge", status: "RUNNING_LOW" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 2 * DAY + HOUR });

    await openItem(page, item);

    const badge = page.getByText("Running low", { exact: true });
    await expect(badge).toBeVisible();
    expect(await backgroundColor(badge)).not.toBe(TRANSPARENT);
    // History entries carry their meaning as text, not color.
    await expect(historyEntries(page).first()).toHaveText(
      `Flagged running low by ${TEST_USER_NAME}, 2 days ago`,
    );
  });

  test("AC16: a change made 2 days ago shows relative time '2 days ago', with the exact date available", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Relative time", status: "RUNNING_LOW" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 2 * DAY + HOUR });

    await openItem(page, item);

    const time = historyEntries(page).first().locator("time");
    await expect(time).toHaveText("2 days ago");
    // Decision 5: the absolute date and time are in the title (hover / long-press), in UTC.
    await expect(time).toHaveAttribute("title", /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{2}:\d{2}\s[AP]M UTC$/);
    await expect(time).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("AC17: entries from both flagging and Mark as bought appear for the same item", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "Both kinds", status: "IN_STOCK" });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 4 * DAY + HOUR });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "RUNNING_LOW", newStatus: "OUT", ago: 3 * DAY + HOUR });
    await testData.addStatusChange({ itemId: item.id, oldStatus: "OUT", newStatus: "IN_STOCK", ago: 2 * DAY + HOUR });

    await openItem(page, item);

    await expect(historyEntries(page)).toHaveCount(3);
    await expect(historyEntries(page).filter({ hasText: /^Flagged running low by / })).toHaveCount(1);
    await expect(historyEntries(page).filter({ hasText: /^Flagged out by / })).toHaveCount(1);
    await expect(historyEntries(page).filter({ hasText: /^Marked as bought by / })).toHaveCount(1);
  });
});

test.describe("Item status change history on the item detail page: edge cases", () => {
  test("Edge: an item with no status changes shows 'No history yet.' and no entries", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({ label: "No history", status: "IN_STOCK" });

    await openItem(page, item);

    await expect(page.getByText("No history yet.")).toBeVisible();
    await expect(historyList(page)).toHaveCount(0);
  });

  test("Edge: entries are newest first, and only the latest 20 are shown", async ({ page, testData }) => {
    const item = await testData.createItem({ label: "Long history", status: "IN_STOCK" });
    // 21 changes, i days ago for i = 1..21; the oldest (21 days) must not be shown.
    for (let daysAgo = 21; daysAgo >= 1; daysAgo -= 1) {
      await testData.addStatusChange({
        itemId: item.id,
        oldStatus: "IN_STOCK",
        newStatus: "RUNNING_LOW",
        ago: daysAgo * DAY + HOUR,
      });
    }

    await openItem(page, item);

    const expected = Array.from(
      { length: 20 },
      (_, index) => `Flagged running low by ${TEST_USER_NAME}, ${index + 1} ${index === 0 ? "day" : "days"} ago`,
    );
    await expect(historyEntries(page)).toHaveText(expected);
    await expect(historyList(page).getByText("21 days ago")).toHaveCount(0);
  });

  test("Edge: at 375px a very long item name and its entries wrap with no horizontal scroll", async ({
    page,
    testData,
  }) => {
    const item = await testData.createItem({
      label: `Long name ${"Extra-creamy barista oat milk family pack ".repeat(2)}Supercalifragilisticexpialidocious`,
      status: "RUNNING_LOW",
    });
    expect(item.name.length).toBeGreaterThanOrEqual(80);
    await testData.addStatusChange({ itemId: item.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW", ago: 2 * DAY + HOUR });

    await openItem(page, item);

    await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeInViewport();
    await expect(historyEntries(page).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
