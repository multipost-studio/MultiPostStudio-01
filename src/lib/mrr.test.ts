import { describe, it, expect } from "vitest";
import { subscriptionMrr, addMrr } from "./mrr";

const plan = { priceMonthly: 2900, priceAnnual: 29000, priceMonthlyInr: 249900, priceAnnualInr: 2400000 };
const sub = (o: Record<string, unknown> = {}) => ({ status: "active", interval: "month", plan, ...o });

describe("subscriptionMrr", () => {
  it("counts an active monthly sub at its monthly price", () => {
    expect(subscriptionMrr(sub())).toEqual({ usd: 2900, inr: 0 });
  });

  it("spreads annual plans over twelve months", () => {
    expect(subscriptionMrr(sub({ interval: "year" }))).toEqual({ usd: Math.round(29000 / 12), inr: 0 });
  });

  it("applies the subscription's own discount", () => {
    expect(subscriptionMrr(sub({ discountPct: 50 }))).toEqual({ usd: 1450, inr: 0 });
    expect(subscriptionMrr(sub({ discountPct: 150 }))).toEqual({ usd: 0, inr: 0 }); // clamped
  });

  it("keeps INR revenue separate, using native INR prices", () => {
    expect(subscriptionMrr(sub({ provider: "razorpay" }))).toEqual({ usd: 0, inr: 249900 });
  });

  it("ignores trials, past-due, canceled and missing subs", () => {
    for (const status of ["trialing", "past_due", "canceled"]) expect(subscriptionMrr(sub({ status }))).toEqual({ usd: 0, inr: 0 });
    expect(subscriptionMrr(null)).toEqual({ usd: 0, inr: 0 });
  });

  it("addMrr adds per currency", () => {
    expect(addMrr({ usd: 1, inr: 2 }, { usd: 3, inr: 4 })).toEqual({ usd: 4, inr: 6 });
  });
});
