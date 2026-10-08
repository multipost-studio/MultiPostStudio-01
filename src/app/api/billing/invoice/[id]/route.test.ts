import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { GET } from "./route";
import { DEFAULT_BRANDING_CONFIG, type BrandingConfig } from "@/lib/branding/config";
import { loadBranding } from "@/lib/branding/store";
import { db } from "@/lib/db";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn().mockResolvedValue({ active: { org: { id: "org1" } } }) }));
vi.mock("@/lib/branding/store", () => ({ loadBranding: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { invoice: { findUnique: vi.fn() } } }));

const invoice = {
  id: "inv1",
  orgId: "org1",
  number: "MPS-0001",
  status: "paid",
  amountDue: 149900,
  currency: "inr",
  pdfUrl: null,
  createdAt: new Date("2026-01-15T00:00:00Z"),
  periodStart: new Date("2026-01-01T00:00:00Z"),
  periodEnd: new Date("2026-01-31T00:00:00Z"),
  org: { name: "Acme", billingName: null, billingEmail: "ap@acme.test", billingAddress: null, billingCountry: null, taxId: null },
};

const branding = (invoicePatch: Partial<BrandingConfig["invoice"]>): BrandingConfig => ({
  ...DEFAULT_BRANDING_CONFIG,
  invoice: { ...DEFAULT_BRANDING_CONFIG.invoice, ...invoicePatch },
});

async function receipt(invoicePatch: Partial<BrandingConfig["invoice"]> = {}): Promise<string> {
  vi.mocked(loadBranding).mockResolvedValue(branding(invoicePatch));
  const res = await GET({} as NextRequest, { params: Promise.resolve({ id: "inv1" }) });
  expect(res.status).toBe(200);
  return res.text();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.invoice.findUnique).mockResolvedValue(invoice as never);
});

describe("payment receipt", () => {
  it("shows the uploaded logo at the left of the header, above the business name", async () => {
    const html = await receipt({ logoUrl: "https://cdn.example.com/logo.png", sellerName: "Acme Studios" });
    expect(html).toContain('<img class="logo" src="https://cdn.example.com/logo.png" alt="Acme Studios">');
    expect(html.indexOf('class="logo"')).toBeLessThan(html.indexOf('class="brand"'));
    expect(html.indexOf('class="logo"')).toBeGreaterThan(html.indexOf("<header>"));
  });

  it("has no logo element when none is set, and looks like it did before", async () => {
    const html = await receipt();
    expect(html).not.toContain('<img class="logo"');
    expect(html).toContain('<div class="brand">MultiPost Studio</div>');
    expect(html).toContain("Payment receipt");
  });

  it("escapes anything in the logo address or business name", async () => {
    const html = await receipt({ logoUrl: 'https://cdn.example.com/a.png" onerror="alert(1)', sellerName: "<b>Acme</b>" });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot; onerror=&quot;alert(1)");
    expect(html).not.toContain("<b>Acme</b>");
  });

  it("prints the seller's details and terms from Invoice Settings", async () => {
    const html = await receipt({ sellerAddress: "1 Main St\nGoa", sellerTaxLabel: "GSTIN", sellerTaxId: "22AAAAA0000A1Z5", sellerEmail: "billing@acme.test", paymentTerms: "Paid by card", footerNote: "Thanks!" });
    for (const t of ["1 Main St", "Goa", "GSTIN: 22AAAAA0000A1Z5", "billing@acme.test", "Paid by card", "Thanks!"]) expect(html).toContain(t);
  });

  it("refuses another organisation's invoice", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...invoice, orgId: "someone-else" } as never);
    const res = await GET({} as NextRequest, { params: Promise.resolve({ id: "inv1" }) });
    expect(res.status).toBe(404);
  });
});
