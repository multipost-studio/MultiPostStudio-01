"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Input, Textarea, Field } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import {
  startCheckoutAction,
  confirmPlanChangeAction,
  cancelSubscriptionAction,
  reactivateSubscriptionAction,
  updateBillingDetailsAction,
  redeemCouponAction,
} from "@/app/actions/billing";

type Plan = {
  key: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  priceMonthlyInr: number;
  priceAnnualInr: number;
  features: string[];
};

export function PlanPicker({
  currentKey,
  plans,
  realBilling,
  razorpayEnabled,
}: {
  currentKey: string;
  plans: Plan[];
  realBilling: boolean;
  /** Only Razorpay has a real, independently-priced INR option wired up (see
   * PLAN_CATALOG.priceMonthlyInr) — Stripe checkout stays USD-only for now. */
  razorpayEnabled: boolean;
}) {
  const [interval, setInterval] = React.useState<"month" | "year">("month");
  const [currency, setCurrency] = React.useState<"usd" | "inr">("usd");
  const [confirm, setConfirm] = React.useState<Plan | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={interval}
          onChange={(v) => setInterval(v as "month" | "year")}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Annual (2 months free)" },
          ]}
        />
        {razorpayEnabled && (
          <Segmented
            value={currency}
            onChange={(v) => setCurrency(v as "usd" | "inr")}
            options={[
              { value: "usd", label: "$ USD" },
              { value: "inr", label: "₹ INR" },
            ]}
          />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const price =
            currency === "inr"
              ? interval === "year" ? p.priceAnnualInr : p.priceMonthlyInr
              : interval === "year" ? p.priceAnnual : p.priceMonthly;
          const current = p.key === currentKey;
          return (
            <div
              key={p.key}
              className={`rounded-[var(--radius-lg)] border p-4 ${current ? "border-[var(--primary)]" : "border-[var(--border)]"}`}
            >
              <p className="text-[15px] font-semibold text-[var(--text)]">{p.name}</p>
              <p className="mt-1 text-[19px] font-semibold text-[var(--text)]">
                {p.key === "enterprise" ? "Custom" : price === 0 ? formatCurrency(0, currency.toUpperCase()) : formatCurrency(price, currency.toUpperCase())}
                {price > 0 && <span className="text-[12px] font-normal text-[var(--text-subtle)]">/{interval === "year" ? "yr" : "mo"}</span>}
              </p>
              <ul className="mt-2 space-y-1 text-[12px] text-[var(--text-muted)]">
                {p.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <Check size={12} className="mt-0.5 shrink-0 text-[var(--success)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant={current ? "ghost" : "secondary"}
                disabled={current || p.key === "enterprise"}
                className="mt-3 w-full"
                onClick={() => setConfirm(p)}
              >
                {current ? "Current plan" : p.key === "enterprise" ? "Contact sales" : "Switch"}
              </Button>
            </div>
          );
        })}
      </div>

      {(() => {
        const confirmPrice = confirm
          ? currency === "inr"
            ? interval === "year" ? confirm.priceAnnualInr : confirm.priceMonthlyInr
            : interval === "year" ? confirm.priceAnnual : confirm.priceMonthly
          : 0;
        const goesToRealCheckout = realBilling && confirmPrice > 0;
        return (
          <Modal
            open={!!confirm}
            onClose={() => setConfirm(null)}
            title={`Switch to ${confirm?.name}?`}
            description={
              goesToRealCheckout
                ? "You'll be redirected to a secure Razorpay checkout to complete payment."
                : `You'll be billed ${interval === "year" ? "annually" : "monthly"}. Change takes effect immediately.`
            }
            footer={
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button
                  size="sm"
                  loading={pending}
                  onClick={async () => {
                    if (!confirm) return;
                    setPending(true);
                    try {
                      if (goesToRealCheckout) {
                        await startCheckoutAction(confirm.key, interval, currency); // redirects to Razorpay
                      } else {
                        await confirmPlanChangeAction(confirm.key, interval); // free plan, or no real billing configured
                      }
                    } finally {
                      // Both paths end in a server-side redirect(), which throws
                      // NEXT_REDIRECT — without `finally` the spinner never stops
                      // and the modal stays open even though the change applied.
                      setPending(false);
                      setConfirm(null);
                    }
                  }}
                >
                  {goesToRealCheckout ? "Continue to checkout" : "Confirm switch"}
                </Button>
              </>
            }
          >
            <p className="text-[14px] text-[var(--text-muted)]">
              {goesToRealCheckout
                ? "Your card details are entered on Razorpay's own page — never seen by this app."
                : "This applies the plan change directly (no real billing provider is configured)."}
            </p>
          </Modal>
        );
      })()}
    </>
  );
}

export function CancelButton() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Cancel subscription
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel subscription?"
        description="You'll keep access until the end of the current period, then drop to Free."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Keep plan</Button>
            <Button
              size="sm"
              variant="danger"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const res = await cancelSubscriptionAction();
                setPending(false);
                toast({ title: res.message ?? "Cancelled", tone: "success" });
                setOpen(false);
                router.refresh();
              }}
            >
              Cancel subscription
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--text-muted)]">This can be undone by re-subscribing any time.</p>
      </Modal>
    </>
  );
}

export function ReactivateButton() {
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const res = await reactivateSubscriptionAction();
        setPending(false);
        toast({ title: res.ok ? res.message ?? "Reactivated" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
        if (res.ok) router.refresh();
      }}
    >
      Reactivate subscription
    </Button>
  );
}

export function BillingDetailsForm({
  initial,
}: {
  initial: { billingName: string; billingEmail: string; billingAddress: string; billingCountry: string; taxId: string };
}) {
  const [v, setV] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const res = await updateBillingDetailsAction(v);
        setPending(false);
        toast({ title: res.ok ? res.message ?? "Saved" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
        if (res.ok) router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company / billing name">
          <Input value={v.billingName} onChange={(e) => set("billingName", e.target.value)} placeholder="Acme Inc." />
        </Field>
        <Field label="Billing email">
          <Input type="email" value={v.billingEmail} onChange={(e) => set("billingEmail", e.target.value)} placeholder="ap@acme.com" />
        </Field>
        <Field label="Country">
          <Input value={v.billingCountry} onChange={(e) => set("billingCountry", e.target.value)} placeholder="United States" />
        </Field>
        <Field label="Tax / VAT ID">
          <Input value={v.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder="EU VAT / GSTIN / EIN" />
        </Field>
      </div>
      <Field label="Billing address">
        <Textarea value={v.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} rows={3} placeholder="Street, city, state, postcode" />
      </Field>
      <Button size="sm" type="submit" loading={pending}>Save billing details</Button>
    </form>
  );
}

export function RedeemCouponForm() {
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const res = await redeemCouponAction(code);
        setPending(false);
        toast({ title: res.ok ? res.message ?? "Applied" : res.error ?? "Invalid code", tone: res.ok ? "success" : "error" });
        if (res.ok) {
          setCode("");
          router.refresh();
        }
      }}
    >
      <Field label="Coupon / credit code" className="flex-1">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH25" />
      </Field>
      <Button size="sm" type="submit" loading={pending} disabled={!code.trim()}>Redeem</Button>
    </form>
  );
}
