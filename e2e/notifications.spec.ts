import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * NOTIFICATION CENTER: lifecycle coverage.
 *
 * Seeds a few notifications for the demo user straight into the database, then drives the real UI:
 * the bell badge and its accessible name, opening the panel WITHOUT marking anything read, click-to-read,
 * mark-all, the /notifications page filters and search, and that settings persist.
 *
 * It writes rows, so it only ever runs against a local throwaway database. The guard below refuses any
 * other host (this repo's .env points at production, and `next start` loads it).
 */

const AUTH_STATE = "e2e/.auth-state.json";
const DEMO_EMAIL = "demo@multipoststudio.app";
const TAG = "e2e-notif";

const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ storageState: AUTH_STATE });
test.skip(!isLocalDb, "Notification e2e writes rows: it only runs against a local database (DATABASE_URL on localhost).");

const prisma = isLocalDb ? new PrismaClient() : (null as unknown as PrismaClient);
let userId = "";

async function seed() {
  await prisma.notification.deleteMany({ where: { userId, dedupeKey: { startsWith: TAG } } });
  await prisma.notification.createMany({
    data: [
      { userId, type: "publish_failed", category: "publishing", priority: "high", title: "Publishing to X failed (e2e)", body: "Caption is too long for X.", linkUrl: "/queue", actionLabel: "Edit post", dedupeKey: `${TAG}:1` },
      { userId, type: "mention", category: "mentions", title: "Ana mentioned you (e2e)", body: "@demo please check this.", linkUrl: "/approvals", dedupeKey: `${TAG}:2` },
      { userId, type: "system", category: "system", title: "Welcome notice (e2e)", body: "A system announcement.", linkUrl: "/dashboard", dedupeKey: `${TAG}:3` },
    ],
  });
}

test.beforeAll(async () => {
  const u = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!u) throw new Error("demo user missing: seed the throwaway database first");
  userId = u.id;
  // Start from a clean slate: everything the seed left unread is marked read. The seed rows have no dedupeKey (NULL),
  // and `NOT (dedupeKey LIKE 'e2e%')` is NULL, not true, for them, so they must be matched explicitly.
  await prisma.notification.updateMany({
    where: { userId, readAt: null, OR: [{ dedupeKey: null }, { NOT: { dedupeKey: { startsWith: TAG } } }] },
    data: { readAt: new Date() },
  });
  await seed();
});

test.afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId, dedupeKey: { startsWith: TAG } } });
  await prisma.$disconnect();
});

test("the bell shows the unread count and announces it", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Notifications, 3 unread" })).toBeVisible();
});

test("opening the panel does not mark anything read", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: /Notifications/ });
  await expect(panel.getByText("Publishing to X failed (e2e)")).toBeVisible();
  await expect(panel.getByText("3 unread")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Notifications, 3 unread" })).toBeVisible();
  expect(await prisma.notification.count({ where: { userId, readAt: null, dedupeKey: { startsWith: TAG } } })).toBe(3);
});

test("tabs filter the panel", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: /Notifications/ });
  await panel.getByRole("tab", { name: "Mentions" }).click();
  await expect(panel.getByText("Ana mentioned you (e2e)")).toBeVisible();
  await expect(panel.getByText("Publishing to X failed (e2e)")).toBeHidden();
  await panel.getByRole("tab", { name: "Publishing" }).click();
  await expect(panel.getByText("Publishing to X failed (e2e)")).toBeVisible();
});

test("clicking a notification marks it read, then goes to its page", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("dialog", { name: /Notifications/ }).getByRole("link", { name: /Ana mentioned you/ }).first().click();
  await expect(page).toHaveURL(/\/approvals/);
  await expect
    .poll(async () => prisma.notification.count({ where: { userId, readAt: null, dedupeKey: { startsWith: TAG } } }), { timeout: 15_000 })
    .toBe(2);
  await expect(page.getByRole("button", { name: "Notifications, 2 unread" })).toBeVisible();
});

test("the Notifications page filters, searches and marks all read", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: /^Unread/ }).click();
  await expect(page.getByText("Publishing to X failed (e2e)")).toBeVisible();
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByPlaceholder("Search notifications").fill("welcome");
  await expect(page.getByText("Welcome notice (e2e)")).toBeVisible();
  await expect(page.getByText("Publishing to X failed (e2e)")).toBeHidden();
  await page.getByPlaceholder("Search notifications").fill("");
  await page.getByRole("button", { name: /Mark all as read|All read/ }).click();
  await expect
    .poll(async () => prisma.notification.count({ where: { userId, readAt: null, dedupeKey: { startsWith: TAG } } }), { timeout: 15_000 })
    .toBe(0);
  await expect(page.getByRole("button", { name: /^Notifications$/ })).toBeVisible();
});

test("settings persist and the reminder options appear", async ({ page }) => {
  await page.goto("/settings/notifications");
  const toast = page.getByRole("switch", { name: "Pop-up for new notifications" });
  const before = await toast.getAttribute("aria-checked");
  await toast.click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Pop-up for new notifications" })).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  // put it back
  await page.getByRole("switch", { name: "Pop-up for new notifications" }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
  await page.getByRole("switch", { name: "Scheduled post reminders" }).scrollIntoViewIfNeeded();
  await expect(page.getByText("1 hour before")).toBeVisible();
});

test("the bell panel fits a phone and has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const box = await page.getByRole("dialog", { name: /Notifications/ }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
