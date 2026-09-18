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
    await page.goto("/dashboard");
    await expect(page.locator('[data-tour="dashboard"]')).toBeVisible();

    const companion = page.getByRole("button", { name: COMPANION });
    await expect(companion).toBeVisible();
    await companion.click();
    await page.getByRole("button", { name: "Show me around" }).click();

    // Step 1 spotlights the dashboard greeting header.
    await expect(page.getByText("Your command center")).toBeVisible();
    await page.screenshot({ path: "test-results/mascot/tour-dashboard.png" });

    // Step 2 navigates into a real composer draft and spotlights it.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Create and manage posts")).toBeVisible();
    await expect(page.locator('[data-tour="composer"]')).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: "test-results/mascot/tour-composer.png" });

    // Ending the tour returns to a quiet companion.
    await page.getByRole("button", { name: "End tour" }).click();
    await expect(page.getByText("Create and manage posts")).toBeHidden();
    await expect(page.getByRole("button", { name: COMPANION })).toBeVisible();
  });

  test("enabled empty states render the companion figure", async ({ page }) => {
    // Seed-dependent: only assert on pages that actually render empty.
    const emptyPages = [
      { route: "/campaigns", title: "No campaigns yet" },
      { route: "/integrations", title: "No accounts connected" },
      { route: "/media", title: /Nothing here yet|No media match/ },
      { route: "/analytics/content", title: "No published posts in this range" },
    ];
    let asserted = 0;
    for (const { route, title } of emptyPages) {
      await page.goto(route);
      const heading = page.getByText(title).first();
      if (await heading.isVisible().catch(() => false)) {
        await expect(page.locator("[data-mascot-figure]").first()).toBeVisible();
        asserted += 1;
        if (asserted === 1) {
          await page.screenshot({ path: "test-results/mascot/empty-state.png" });
        }
      }
    }
    // The demo seed is expected to leave at least one of these empty.
    expect(asserted).toBeGreaterThan(0);
  });
});
