import { test as setup, expect } from "@playwright/test";

/**
 * One demo login for the whole sweep. Runs first via the "setup" project's
 * dependency edge; the sweep spec consumes e2e/.auth-state.json.
 */
setup("demo login for responsive sweep", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill("demo@multipoststudio.app");
  await page.getByLabel(/password/i).fill("demo1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Poll instead of waitForURL: the login chain fires overlapping navigations
  // (POST redirect + client handoff) that abort the waiter mid-flight.
  await expect
    .poll(async () => page.url(), { timeout: 30_000 })
    .toMatch(/\/(dashboard|onboarding)/);
  await page.context().storageState({ path: "e2e/.auth-state.json" });
});
