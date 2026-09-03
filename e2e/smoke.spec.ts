import { test, expect } from "@playwright/test";

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/MultiPost Studio/i);
  await expect(page.getByRole("link", { name: /log ?in|sign ?in/i }).first()).toBeVisible();
});

test("demo login reaches the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("demo@multipoststudio.app");
  await page.getByLabel(/password/i).fill("demo1234");
  await page.getByRole("button", { name: /log ?in|sign ?in|continue/i }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
});

test("health endpoint is up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).ok).toBe(true);
});
