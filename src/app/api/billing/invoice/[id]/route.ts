import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Invoice document.
 *
 * Stripe gives us a hosted PDF and we redirect to it. Razorpay — the provider
 * actually configured on this deployment — gives us nothing, so those invoices
 * were served as a plain .txt file, which is not something a customer can file
 * with their accounts.
 *
 * This renders a printable document instead: opened inline, the browser's
 * own Print → Save as PDF produces a real PDF. That covers the need without
 * pulling a PDF library into the bundle for one route.
 *
 * It is a payment receipt, not a jurisdiction-specific tax invoice — it does
 * not compute GST/VAT breakdowns, and does not claim to.
 */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const inv = await db.invoice.findUnique({ where: { id }, include: { org: true } });
  if (!inv || inv.orgId !== ctx.active.org.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // The provider's own PDF is authoritative whenever there is one.
  if (inv.pdfUrl) return NextResponse.redirect(inv.pdfUrl);

  const o = inv.org;
  const billedTo = [
    o.billingName || o.name,
    o.billingEmail,
    ...(o.billingAddress ? o.billingAddress.split("\n") : []),
    o.billingCountry,
    o.taxId ? `Tax ID: ${o.taxId}` : null,
  ].filter(Boolean) as string[];

  const rows: [string, string][] = [
    ["Invoice", inv.number],
    ["Status", inv.status.toUpperCase()],
    ["Issued", formatDate(inv.createdAt)],
    ["Period", `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`],
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(inv.number)} · MultiPost Studio</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f1ee; color: #241a1b;
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .sheet { max-width: 720px; margin: 32px auto; padding: 44px 48px; background: #fffaf6;
           border: 1px solid #e6dcd6; border-radius: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           gap: 24px; border-bottom: 2px solid #6f262c; padding-bottom: 18px; }
  .brand { font-size: 19px; font-weight: 700; color: #6f262c; letter-spacing: -0.01em; }
  .doctype { font-size: 12px; text-transform: uppercase; letter-spacing: 0.09em; color: #8a7a76; }
  h1 { margin: 0; font-size: 15px; font-weight: 600; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px; margin: 24px 0 0; }
  dt { color: #8a7a76; font-size: 13px; }
  dd { margin: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
  .to { margin-top: 28px; }
  .to h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.09em;
           color: #8a7a76; margin: 0 0 6px; font-weight: 600; }
  .to p { margin: 0; font-size: 14px; }
  .total { display: flex; justify-content: space-between; align-items: baseline;
           margin-top: 32px; padding-top: 16px; border-top: 1px solid #e6dcd6; }
  .total span { font-size: 13px; color: #8a7a76; }
  .total strong { font-size: 24px; font-variant-numeric: tabular-nums; }
  footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e6dcd6;
           font-size: 12px; color: #8a7a76; }
  .print { margin: 0 auto 0; display: block; max-width: 720px; padding: 0 48px 32px; }
  button { font: inherit; padding: 8px 16px; border-radius: 8px; border: 1px solid #6f262c;
           background: #6f262c; color: #fffaf6; cursor: pointer; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; border: 0; border-radius: 0; padding: 0; background: #fff; }
    .print { display: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <div>
      <div class="brand">MultiPost Studio</div>
      <div class="doctype">Payment receipt</div>
    </div>
    <h1>${esc(inv.number)}</h1>
  </header>

  <dl>
    ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n    ")}
  </dl>

  <div class="to">
    <h2>Billed to</h2>
    ${billedTo.map((l) => `<p>${esc(l)}</p>`).join("\n    ")}
  </div>

  <div class="total">
    <span>Amount ${inv.status === "paid" ? "paid" : "due"}</span>
    <strong>${esc(formatCurrency(inv.amountDue, inv.currency.toUpperCase()))}</strong>
  </div>

  <footer>
    This is a payment receipt for the period shown. It is not a
    jurisdiction-specific tax invoice and contains no tax breakdown.
  </footer>
</div>
<div class="print"><button onclick="window.print()">Print / Save as PDF</button></div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Inline, not an attachment: the point is to open it so the browser can
      // print it to PDF.
      "content-disposition": `inline; filename="${inv.number}.html"`,
      // A receipt is per-customer and must never be cached by a proxy.
      "cache-control": "private, no-store",
    },
  });
}
