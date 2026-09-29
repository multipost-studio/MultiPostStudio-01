import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureAffiliateApplication, generateCommissionForInvoice, attributeAffiliateConversion, CURRENT_AFFILIATE_TERMS_VERSION } from "./affiliates";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

vi.mock("@/lib/db", () => ({
  db: {
    affiliate: { findUnique: vi.fn(), create: vi.fn() },
    invoice: { findUnique: vi.fn() },
    affiliateConversion: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    affiliateCommission: { count: vi.fn(), create: vi.fn() },
    membership: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/settings", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));

const BASE_SETTINGS = {
  affiliateEnabled: true,
  affiliateApplicationRequired: true,
  affiliateAutoApprove: false,
  affiliateDefaultCommissionType: "percent_recurring" as const,
  affiliateDefaultCommissionRate: 20,
  affiliateDefaultFixedAmount: 0,
  affiliateDefaultRecurringMonths: 12,
  affiliateDefaultCookieDays: 30,
  affiliateDefaultPayoutThreshold: 5000,
};

describe("ensureAffiliateApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue(BASE_SETTINGS as Awaited<ReturnType<typeof getSettings>>);
    vi.mocked(db.affiliate.findUnique).mockResolvedValue(null);
    vi.mocked(db.affiliate.create).mockImplementation(({ data }) => Promise.resolve({ id: "aff_1", ...data }) as never);
  });

  it("refuses to create an application without terms acceptance — this is the DPDP consent-recording gate", async () => {
    await expect(ensureAffiliateApplication("user_1", false)).rejects.toThrow(/accept the Affiliate Program Terms/);
    expect(db.affiliate.create).not.toHaveBeenCalled();
  });

  it("records termsAcceptedAt, disclosureAcknowledgedAt and the current terms version when accepted", async () => {
    vi.mocked(db.affiliate.findUnique).mockImplementation(({ where }: { where: { userId?: string; affiliateCode?: string } }) =>
      Promise.resolve(where.userId ? null : null) as never,
    );
    await ensureAffiliateApplication("user_1", true);

    expect(db.affiliate.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(db.affiliate.create).mock.calls[0][0];
    expect(call.data.termsVersion).toBe(CURRENT_AFFILIATE_TERMS_VERSION);
    expect(call.data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(call.data.disclosureAcknowledgedAt).toBeInstanceOf(Date);
  });

  it("returns the existing application without re-checking terms if one already exists (idempotent re-application)", async () => {
    vi.mocked(db.affiliate.findUnique).mockResolvedValue({ id: "aff_existing" } as never);
    const result = await ensureAffiliateApplication("user_1", false);
    expect(result).toEqual({ id: "aff_existing" });
    expect(db.affiliate.create).not.toHaveBeenCalled();
  });
});

describe("attributeAffiliateConversion — self-referral guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue({ ...BASE_SETTINGS, affiliateEnabled: true } as Awaited<ReturnType<typeof getSettings>>);
    vi.mocked(db.affiliate.findUnique).mockResolvedValue({ id: "aff_1", userId: "user_1" } as never);
  });

  it("blocks attribution when the referred org is the affiliate's own (same-account self-referral)", async () => {
    vi.mocked(db.membership.findFirst).mockResolvedValue({ id: "mem_1" } as never);
    await attributeAffiliateConversion("CODE123", "org_2");
    expect(db.affiliateConversion.create).not.toHaveBeenCalled();
  });

  it("blocks attribution when the new org's member shares the affiliate's own email (second-account self-referral)", async () => {
    vi.mocked(db.membership.findFirst).mockImplementation(((args?: { where?: { orgId: string; userId?: string; user?: unknown } }) =>
      Promise.resolve(args?.where?.userId ? null : { id: "mem_2" })) as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ email: "affiliate@example.com" } as never);

    await attributeAffiliateConversion("CODE123", "org_2");

    expect(db.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org_2", user: { email: "affiliate@example.com" } }) }),
    );
    expect(db.affiliateConversion.create).not.toHaveBeenCalled();
  });

  it("attributes normally when there is no same-account or same-email overlap", async () => {
    vi.mocked(db.membership.findFirst).mockResolvedValue(null);
    vi.mocked(db.user.findUnique).mockResolvedValue({ email: "affiliate@example.com" } as never);
    vi.mocked(db.affiliateConversion.create).mockResolvedValue({ id: "conv_1" } as never);

    await attributeAffiliateConversion("CODE123", "org_2");

    expect(db.affiliateConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ affiliateId: "aff_1", orgId: "org_2" }) }),
    );
  });
});

describe("generateCommissionForInvoice — server-side-only trust boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue({ ...BASE_SETTINGS, affiliateEnabled: true } as Awaited<ReturnType<typeof getSettings>>);
  });

  it("never trusts an amount from anywhere but the already-persisted invoice row", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ id: "inv_1", orgId: "org_1", status: "paid", amountDue: 10000, currency: "usd" } as never);
    vi.mocked(db.affiliateConversion.findUnique).mockResolvedValue({ id: "conv_1", affiliateId: "aff_1", qualifiedAt: null } as never);
    vi.mocked(db.affiliate.findUnique).mockResolvedValue({
      id: "aff_1",
      applicationStatus: "approved",
      status: "active",
      commissionType: "percent_recurring",
      commissionRate: 20,
      recurringMonths: 12,
      userId: "user_1",
    } as never);
    vi.mocked(db.affiliateCommission.count).mockResolvedValue(0);
    vi.mocked(db.affiliateCommission.create).mockResolvedValue({ id: "comm_1" } as never);

    await generateCommissionForInvoice("inv_1");

    expect(db.affiliateCommission.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountMinor: 2000, invoiceId: "inv_1", orgId: "org_1" }) }),
    );
  });

  it("is a no-op when the invoice isn't actually paid", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ id: "inv_1", orgId: "org_1", status: "pending", amountDue: 10000 } as never);
    await generateCommissionForInvoice("inv_1");
    expect(db.affiliateConversion.findUnique).not.toHaveBeenCalled();
    expect(db.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it("is a no-op when the affiliate isn't approved+active, even if the org is attributed", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ id: "inv_1", orgId: "org_1", status: "paid", amountDue: 10000, currency: "usd" } as never);
    vi.mocked(db.affiliateConversion.findUnique).mockResolvedValue({ id: "conv_1", affiliateId: "aff_1", qualifiedAt: null } as never);
    vi.mocked(db.affiliate.findUnique).mockResolvedValue({ id: "aff_1", applicationStatus: "pending_review", status: "active" } as never);

    await generateCommissionForInvoice("inv_1");
    expect(db.affiliateCommission.create).not.toHaveBeenCalled();
  });
});
