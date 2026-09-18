import { test, expect, type Page } from "@playwright/test";

/**
 * RESPONSIVE SWEEP — horizontal-overflow audit across the mandated
 * device-width matrix.
 *
 * For every route x viewport it asserts that the document never scrolls
 * horizontally (scrollWidth <= innerWidth + 1px) and reports the offending
 * elements when it does, so failures point at the culprit instead of just
 * the page.
 *
 * Auth: one demo login in beforeAll writes e2e/.auth-state.json; the "app"
 * describe reuses it while "public" runs logged-out. Tests run in parallel
 * (one per route) so the full matrix finishes in minutes, not tens of them.
 */

// Mandated matrix: mobile 320-480, tablet 600-1024, desktop 1280-2560+.
const WIDTHS = [
  320, 360, 375, 390, 412, 430, 480, 600, 768, 820, 834, 1024, 1280, 1366, 1440,
  1536, 1920, 2560,
];

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/pricing",
  "/features",
  "/blog",
  "/about",
  "/contact",
  "/tools",
];

const APP_ROUTES = [
  "/dashboard",
  "/composer",
  "/calendar",
  "/analytics",
  "/queue",
  "/ideas",
  "/inbox",
  "/approvals",
  "/campaigns",
  "/team",
  "/templates",
  "/settings/profile",
];

// /composer/new creates a draft then redirects to /composer/[id], so each
// visit writes demo data: sweep it at 3 representative widths only. The
// redirect target (the real composer surface) is what gets measured.
const COMPOSER_NEW_WIDTHS = [360, 768, 1440];

// Landscape spot-checks on the highest-risk surfaces.
const LANDSCAPE: { route: string; width: number; height: number }[] = [
  { route: "/dashboard", width: 844, height: 390 },
  { route: "/calendar", width: 844, height: 390 },
  { route: "/composer/new", width: 844, height: 390 },
  { route: "/dashboard", width: 1180, height: 820 },
  { route: "/calendar", width: 1180, height: 820 },
];

const AUTH_STATE = "e2e/.auth-state.json";

test.describe.configure({ timeout: 300_000 });


// Auth comes from the "setup" project (e2e/responsive-setup.ts), which logs
// in once before any chromium test creates a context.
test.use({ storageState: AUTH_STATE });

const consoleErrors: string[] = [];
let current = "";

function watch(page: Page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(current + ": " + msg.text().slice(0, 160));
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(current + ": PAGEERROR " + String(err).slice(0, 160));
  });
}

async function measure(page: Page): Promise<{
  vw: number;
  sw: number;
  offenders: string[];
}> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    if (sw > vw + 1) {
      const els = document.querySelectorAll("body *");
      for (const el of els) {
        if (offenders.length >= 6) break;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1) {
          // Content inside a horizontal scroll/clip region is *supposed* to be
          // wider than the viewport (wide tables, kanban, heatmaps) - and
          // getBoundingClientRect ignores clipping, so only flag elements
          // with no clipping/scrolling ancestor below body.
          let p: HTMLElement | null = el as HTMLElement;
          let contained = false;
          while (p && p !== document.body) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") { contained = true; break; }
            p = p.parentElement;
          }
          if (!contained) {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLElement).id
            ? "#" + (el as HTMLElement).id
            : "";
          const cls =
            typeof (el as HTMLElement).className === "string"
              ? (el as HTMLElement).className
                  .split(/\s+/)
                  .filter((c) => c && c.indexOf("mps-") !== 0)
                  .slice(0, 3)
                  .map((c) => "." + c)
                  .join("")
              : "";
          const text = (el.textContent || "").trim().slice(0, 24);
          offenders.push(
            tag +
              id +
              cls +
              " [" +
              Math.round(r.left) +
              "->" +
              Math.round(r.right) +
              "]" +
              (text ? ' "' + text + '"' : ""),
          );
          }
        }
      }
    }
    return { vw: vw, sw: sw, offenders: offenders };
  });
}

async function check(
  page: Page,
  failures: string[],
  url: string,
  width: number,
  height = 900,
) {
  current = url + " @ " + width + "x" + height;
  await page.setViewportSize({ width: width, height: height });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Redirecting pages need a settle window: poll until the URL stops
  // moving, then measure whatever committed.
  let settled = "";
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    const u = page.url();
    if (u === settled) break;
    settled = u;
  }
  const landed = url + " @ " + width + "x" + height + " -> " + settled;
  // A late client navigation destroys the execution context mid-measure.
  let result: { vw: number; sw: number; offenders: string[] } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await measure(page);
      break;
    } catch (e) {
      if (attempt === 4) throw e;
      await page.waitForTimeout(800);
    }
  }
  if (!result) throw new Error("measure failed for " + landed);

  if (result.sw > result.vw + 1) {
    failures.push(
      landed +
        ": scrollWidth=" +
        result.sw +
        " > viewport=" +
        result.vw +
        "\n    -> " +
        (result.offenders.join("\n    -> ") ||
          "(no element found - check 100vw/fixed children)"),
    );
  }
}

function sweepTest(route: string, widths: number[]) {
  test("sweep " + route, async ({ page }) => {
    watch(page);
    const failures: string[] = [];
    for (const w of widths) {
      await check(page, failures, route, w);
    }
    expect(
      failures,
      failures.length + " overflow failures:\n" + failures.join("\n"),
    ).toEqual([]);
  });
}

test.describe("public (logged out)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const route of PUBLIC_ROUTES) sweepTest(route, WIDTHS);
});

test.describe("app (demo login)", () => {
  test.use({ storageState: AUTH_STATE });
  for (const route of APP_ROUTES) sweepTest(route, WIDTHS);
  sweepTest("/composer/new", COMPOSER_NEW_WIDTHS);
  for (const l of LANDSCAPE) {
    test(
      "sweep " + l.route + " landscape " + l.width + "x" + l.height,
      async ({ page }) => {
        watch(page);
        const failures: string[] = [];
        await check(page, failures, l.route, l.width, l.height);
        expect(
          failures,
          failures.length + " overflow failures:\n" + failures.join("\n"),
        ).toEqual([]);
      },
    );
  }
});

test.afterAll(() => {
  const uniqueErrors = Array.from(new Set(consoleErrors)).slice(0, 20);
  if (uniqueErrors.length > 0) {
    console.log(
      "\n[responsive-sweep] console/page errors observed:\n  " +
        uniqueErrors.join("\n  "),
    );
  }
});