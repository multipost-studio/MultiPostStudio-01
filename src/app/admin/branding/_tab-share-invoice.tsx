"use client";

import * as React from "react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { isImageUrl, type BrandingConfig } from "@/lib/branding/config";
import { formatDate } from "@/lib/utils";
import { Field, Panel } from "./_ui";

type Props = { draft: BrandingConfig; set: <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => void };

/** Raster images that ship with the app and work as share images. */
const BUNDLED = [
  { value: "/media/Social-profile.png", label: "Social profile card" },
  { value: "/media/logo-light.png", label: "Logo (light)" },
  { value: "/media/logo-dark.png", label: "Logo (dark)" },
  { value: "/media/Logo_white.png", label: "Logo, white" },
  { value: "/media/Logo_black.png", label: "Logo, black" },
];
const DEFAULT_IMAGE = "/media/logo-light.png";

export function ShareTab({ draft, set }: Props) {
  const share = draft.share;
  const patch = (p: Partial<BrandingConfig["share"]>) => set("share", { ...share, ...p });
  const shown = share.imageUrl || DEFAULT_IMAGE;
  const valid = share.imageUrl === "" || isImageUrl(share.imageUrl);
  return (
    <div className="space-y-5">
      <Panel title="Social image" description="The picture shown when someone shares a link to your site on WhatsApp, LinkedIn, X, Facebook, Slack and similar. Pages without their own image use this one.">
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <Field label="Image address" hint="A PNG or JPG, ideally 1200 × 630. Leave empty to use the logo.">
              <Input aria-invalid={!valid || undefined} className={!valid ? "border-[var(--danger)]" : undefined} maxLength={500} placeholder="https://… or /media/…" value={share.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} />
            </Field>
            <Field label="Or use one that ships with the app">
              <Select aria-label="Bundled image" value={BUNDLED.some((b) => b.value === share.imageUrl) ? share.imageUrl : ""} onChange={(e) => patch({ imageUrl: e.target.value })}>
                <option value="">Choose…</option>
                {BUNDLED.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description of the image" hint="Read aloud by screen readers when the card is shown.">
              <Input maxLength={120} value={share.imageAlt} onChange={(e) => patch({ imageAlt: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="X (Twitter) handle" hint="Credits your account on shared cards. Optional.">
                <Input maxLength={16} placeholder="@yourbrand" value={share.twitterHandle} onChange={(e) => patch({ twitterHandle: e.target.value })} />
              </Field>
              <Field label="Card size">
                <Select value={share.cardType} onChange={(e) => patch({ cardType: e.target.value as BrandingConfig["share"]["cardType"] })}>
                  <option value="summary">Small, image beside text</option>
                  <option value="summary_large_image">Large image on top</option>
                </Select>
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">Preview</p>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-elevated)]">
              <div className={share.cardType === "summary_large_image" ? "aspect-[1200/630] w-full bg-[var(--bg-sunken)]" : "hidden"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown} alt="" className="h-full w-full object-contain p-6" />
              </div>
              <div className="flex items-center gap-3 p-3">
                {share.cardType === "summary" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shown} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] object-contain p-1" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] uppercase tracking-wide text-[var(--text-subtle)]">multipoststudio.online</p>
                  <p className="truncate text-[14px] font-semibold text-[var(--text)]">MultiPost Studio — Social Media Operating System</p>
                  <p className="truncate text-[12.5px] text-[var(--text-muted)]">The AI-powered social media operating system.</p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">Images hosted elsewhere may not preview here, but they still work on shared links. Networks cache cards, so a change can take a while to appear on links shared before.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function InvoiceTab({ draft, set }: Props) {
  const inv = draft.invoice;
  const patch = (p: Partial<BrandingConfig["invoice"]>) => set("invoice", { ...inv, ...p });
  const lines = [...(inv.sellerAddress ? inv.sellerAddress.split("\n") : []), inv.sellerTaxId ? `${inv.sellerTaxLabel || "Tax ID"}: ${inv.sellerTaxId}` : "", inv.sellerEmail, inv.sellerWebsite].filter(Boolean);
  return (
    <div className="space-y-5">
      <Panel title="Invoice settings" description="Who the receipt says it is from. Customers see this on every payment receipt they open from Billing, so use your registered business details.">
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Document title" hint='For example "Payment receipt" or "Invoice".'>
                <Input maxLength={40} value={inv.documentTitle} onChange={(e) => patch({ documentTitle: e.target.value })} />
              </Field>
              <Field label="Business name">
                <Input maxLength={120} value={inv.sellerName} onChange={(e) => patch({ sellerName: e.target.value })} />
              </Field>
            </div>
            <Field label="Business address" hint="Line breaks are kept.">
              <Textarea rows={3} maxLength={300} value={inv.sellerAddress} onChange={(e) => patch({ sellerAddress: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tax ID label" hint="GSTIN, VAT number, EIN…">
                <Input maxLength={30} value={inv.sellerTaxLabel} onChange={(e) => patch({ sellerTaxLabel: e.target.value })} />
              </Field>
              <Field label="Tax ID" hint="Shown only if filled.">
                <Input maxLength={40} value={inv.sellerTaxId} onChange={(e) => patch({ sellerTaxId: e.target.value })} />
              </Field>
              <Field label="Billing email">
                <Input type="email" maxLength={120} value={inv.sellerEmail} onChange={(e) => patch({ sellerEmail: e.target.value })} />
              </Field>
              <Field label="Website">
                <Input maxLength={300} placeholder="https://" value={inv.sellerWebsite} onChange={(e) => patch({ sellerWebsite: e.target.value })} />
              </Field>
            </div>
            <Field label="Payment terms" hint="A short line above the total. Optional.">
              <Input maxLength={300} value={inv.paymentTerms} onChange={(e) => patch({ paymentTerms: e.target.value })} />
            </Field>
            <Field label="Footer note" hint="Keep the default unless an accountant has approved other wording. The receipt does not calculate tax.">
              <Textarea rows={3} maxLength={500} value={inv.footerNote} onChange={(e) => patch({ footerNote: e.target.value })} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">Preview</p>
            <div className="rounded-[var(--radius-lg)] border border-[#e8e3f5] bg-[#faf8f5] p-5 text-[#241a1b] shadow-[var(--shadow-card)]">
              <div className="border-b-2 border-[#FF4D0E] pb-3">
                <p className="text-[16px] font-bold tracking-tight text-[#FF4D0E]">{inv.sellerName || "Business name"}</p>
                <p className="text-[11px] uppercase tracking-[0.09em] text-[#8a7a76]">{inv.documentTitle}</p>
                {lines.map((l) => (
                  <p key={l} className="mt-0.5 text-[11.5px] text-[#8a7a76]">{l}</p>
                ))}
              </div>
              <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12px]">
                <dt className="text-[#8a7a76]">Invoice</dt>
                <dd>MPS-0001</dd>
                <dt className="text-[#8a7a76]">Issued</dt>
                <dd>{formatDate(new Date("2026-01-15T00:00:00Z"))}</dd>
              </dl>
              {inv.paymentTerms && <p className="mt-3 text-[12px] text-[#5c4f4c]">{inv.paymentTerms}</p>}
              <div className="mt-4 flex items-baseline justify-between border-t border-[#e6dcd6] pt-3">
                <span className="text-[12px] text-[#8a7a76]">Amount paid</span>
                <strong className="text-[18px]">₹1,499.00</strong>
              </div>
              {inv.footerNote && <p className="mt-4 border-t border-[#e6dcd6] pt-2.5 text-[11px] text-[#8a7a76]">{inv.footerNote}</p>}
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">Example only. Receipts for invoices a payment provider hosts (Razorpay, Stripe) use the provider&apos;s own document.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
