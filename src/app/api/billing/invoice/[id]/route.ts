import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const inv = await db.invoice.findUnique({ where: { id }, include: { org: true } });
  if (!inv || inv.orgId !== ctx.active.org.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (inv.pdfUrl) return NextResponse.redirect(inv.pdfUrl);

  const o = inv.org;
  const lines = [
    "MULTIPOST STUDIO — RECEIPT",
    "=========================",
    ``,
    `Invoice        ${inv.number}`,
    `Status         ${inv.status.toUpperCase()}`,
    `Issued         ${formatDate(inv.createdAt)}`,
    `Period         ${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`,
    ``,
    `Billed to`,
    `  ${o.billingName || o.name}`,
    ...(o.billingEmail ? [`  ${o.billingEmail}`] : []),
    ...(o.billingAddress ? o.billingAddress.split("\n").map((l) => `  ${l}`) : []),
    ...(o.billingCountry ? [`  ${o.billingCountry}`] : []),
    ...(o.taxId ? [`  Tax ID: ${o.taxId}`] : []),
    ``,
    `-------------------------`,
    `Amount due     ${formatCurrency(inv.amountDue, inv.currency.toUpperCase())}`,
    `-------------------------`,
    ``,
    `Thank you.`,
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${inv.number}.txt"`,
    },
  });
}
