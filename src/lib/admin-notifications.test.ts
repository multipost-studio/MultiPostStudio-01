import { describe, it, expect } from "vitest";
import { rollupModules, itemCounts } from "./admin-notifications";
import { SIGNALS, signalForItemKey, SIGNAL_BY_KEY } from "./admin-signals";
import { ADMIN_NAV } from "./nav";

/**
 * The badge maths and the signal registry's invariants. If a signal points at
 * a module the sidebar doesn't have, its badge silently vanishes — so that's
 * pinned here.
 */

describe("itemCounts", () => {
  it("an unseen item always counts", () => {
    expect(itemCounts(false, false)).toBe(true);
    expect(itemCounts(true, false)).toBe(true);
  });
  it("a seen non-persistent item stops counting", () => {
    expect(itemCounts(false, true)).toBe(false);
  });
  it("a seen persistent item keeps counting — the problem is unresolved", () => {
    expect(itemCounts(true, true)).toBe(true);
  });
});

describe("rollupModules", () => {
  const mk = (module: string, priority: "info" | "warn" | "critical", counts: boolean) => ({ module, priority, counts });

  it("sums counting items per module", () => {
    const out = rollupModules([
      mk("Billing", "critical", true),
      mk("Billing", "warn", true),
      mk("Support", "warn", true),
    ]);
    expect(out.Billing.count).toBe(2);
    expect(out.Support.count).toBe(1);
  });

  it("ignores items that don't count", () => {
    const out = rollupModules([mk("Users", "info", false), mk("Users", "info", true)]);
    expect(out.Users.count).toBe(1);
  });

  it("a module with nothing counting doesn't appear", () => {
    expect(rollupModules([mk("Posts", "warn", false)]).Posts).toBeUndefined();
  });

  it("takes the highest priority among a module's counting items", () => {
    const out = rollupModules([
      mk("Billing", "info", true),
      mk("Billing", "critical", true),
      mk("Billing", "warn", true),
    ]);
    expect(out.Billing.priority).toBe("critical");
  });
});

describe("signal registry invariants", () => {
  const navLabels = new Set(ADMIN_NAV.map((n) => n.label));

  it("every signal targets a real sidebar module", () => {
    for (const s of SIGNALS) {
      expect(navLabels.has(s.module), `${s.key} → "${s.module}" not in ADMIN_NAV`).toBe(true);
    }
  });

  it("signal keys are unique", () => {
    const keys = SIGNALS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("SIGNAL_BY_KEY covers every signal", () => {
    for (const s of SIGNALS) expect(SIGNAL_BY_KEY[s.key]).toBe(s);
  });

  it("resolves an item key back to its signal", () => {
    // Item keys are `<signalKey>:<id>...`.
    expect(signalForItemKey("billing.past_due:org_123")?.key).toBe("billing.past_due");
    expect(signalForItemKey("support.waiting:t1:1699999999999")?.key).toBe("support.waiting");
    expect(signalForItemKey("nonsense:x")).toBeUndefined();
  });
});
