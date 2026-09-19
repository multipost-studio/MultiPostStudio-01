import { test, expect } from "@playwright/test";

/**
 * MASCOT — companion regression coverage.
 *
 * - Public: the landing page shows a quiet companion that opens the
 *   assistant panel on tap and closes with Escape, without overflow.
 * - App: the dashboard tour spotlights REAL UI targets, and empty states
 *   render the decorative companion figure where enabled.
 *
 * Auth comes from the "setup" project (e2e/responsive-setup.ts), which logs
 * in once before any chromium test creates a context.
 */

const AUTH_STATE = "e2e/.auth-state.json";
const COMPANION = /multipost studio companion/i;

// The app tests walk multiple heavyweight routes (dashboard aggregates,
// composer draft creation, analytics rollups) — allow headroom.
test.describe.configure({ timeout: 180_000 });

test.use({ storageState: AUTH_STATE });

test.describe("companion on the marketing page", () => {
  test("quiet companion opens and closes the assistant", async ({ page }) => {
    await page.goto("/");
    const companion = page.getByRole("button", { name: COMPANION });
    await expect(companion).toBeVisible();
    await page.screenshot({ path: "test-results/mascot/marketing.png" });

    await companion.click();
    const dialog = page.getByRole("dialog", { name: "MultiPost Assistant" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Show me around" })).toBeVisible();
    await page.screenshot({ path: "test-results/mascot/marketing-assistant.png" });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("fits a 390px viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const companion = page.getByRole("button", { name: COMPANION });
    await expect(companion).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await companion.click();
    await expect(page.getByRole("dialog", { name: "MultiPost Assistant" })).toBeVisible();
    const panelOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(panelOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/mascot/marketing-mobile-assistant.png" });
  });
});

test.describe("companion in the app", () => {
  test("tour spotlights real UI from dashboard to composer", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-tour="dashboard"]')).toBeVisible();

    const companion = page.getByRole("button", { name: COMPANION });
    await expect(companion).toBeVisible();
    await companion.click();
    await page.getByRole("button", { name: "Show me around" }).click();

    // Step 1 spotlights the dashboard greeting header.
    await expect(page.getByText("Your command center")).toBeVisible();
    await page.screenshot({ path: "test-results/mascot/tour-dashboard.png" });

    // Step 2 navigates into a real composer draft and spotlights it. The
    // card repositions itself while the page settles, so click with force
    // (or dispatch with bubbles: true) to ensure React 19 event delegation receives it.
    const nextBtn = page.getByRole("button", { name: "Next", exact: true });
    try {
      await nextBtn.click({ force: true, timeout: 5000 });
    } catch {
      await nextBtn.dispatchEvent("click", { bubbles: true });
    }
    await expect(page.getByText("Create and manage posts")).toBeVisible();
    // Generous timeout: under parallel CI workers the single app server
    // (plus bcrypt logins) can stall RSC navigation for many seconds.
    await expect(page.locator('[data-tour="composer"]')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "test-results/mascot/tour-composer.png" });

    // Ending the tour returns to a quiet companion. The card repositions
    // itself as the page settles, so click with force and fallback to bubbling dispatch.
    const endTour = page.getByRole("button", { name: "End tour" });
    try {
      await endTour.click({ force: true, timeout: 5000 });
    } catch {
      await endTour.dispatchEvent("click", { bubbles: true });
    }
    await expect(endTour).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: COMPANION })).toBeVisible();
  });

  test("enabled empty states render the companion figure", async ({ page }) => {
    // Navigate to /media and filter by an unmatched search query to render
    // the mascot empty state deterministically across any seed data.
    await page.goto("/media", { waitUntil: "domcontentloaded", timeout: 90_000 });
    const searchInput = page.getByPlaceholder("Search files…");
    await expect(searchInput).toBeVisible({ timeout: 20_000 });
    await searchInput.fill("___no_matching_media___");
    await expect(page.getByText("No media match")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-mascot-figure]").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/mascot/empty-state.png" });
  });
});
