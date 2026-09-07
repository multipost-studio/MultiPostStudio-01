"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmRazorpaySubscriptionAction } from "@/app/actions/billing";

/**
 * Opens Razorpay Checkout over our own page for an already-created
 * subscription. Dismissing the modal returns to billing settings — the thing
 * the hosted rzp.io page could not do.
 *
 * On success it asks the server to confirm the payment with Razorpay directly
 * and activate the plan, rather than assuming the webhook will arrive — a paid
 * subscription with no webhook delivered left customers on their old plan
 * reading "Plan updated." The webhook still handles renewals and cancellations,
 * and applyPlan is idempotent, so both paths landing is harmless.
 */

type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  retry: { enabled: boolean };
  handler: () => void;
  modal: { ondismiss: () => void };
};
type RazorpayCtor = new (o: RazorpayOptions) => { open: () => void; close?: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function RazorpayCheckout({
  subscriptionId,
  keyId,
  planName,
  interval,
  email,
  customerName,
}: {
  subscriptionId: string;
  keyId: string;
  planName: string;
  interval: "month" | "year";
  email: string;
  customerName: string;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<
    "loading" | "ready" | "paying" | "activating" | "pending" | "done" | "failed"
  >("loading");
  const [pendingReason, setPendingReason] = React.useState("");
  // Opened once automatically; reopened only when the customer asks.
  const autoOpened = React.useRef(false);

  const open = React.useCallback(() => {
    if (!window.Razorpay) {
      setState("failed");
      return;
    }
    setState("paying");
    const rzp = new window.Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: "MultiPost Studio",
      description: `${planName} — billed ${interval === "year" ? "annually" : "monthly"}`,
      prefill: { name: customerName, email },
      theme: { color: "#6F262C" },
      retry: { enabled: true },
      handler: () => {
        // Paid. Don't assume the webhook will land — a delivered payment with
        // no webhook left customers on the old plan reading "Plan updated."
        // Confirm server-side (Razorpay is asked directly), and only then
        // report success.
        setState("activating");
        void confirmRazorpaySubscriptionAction(subscriptionId).then((res) => {
          if (res.ok) {
            setState("done");
            router.push("/settings/billing?changed=1");
          } else {
            // The money is taken; only activation is outstanding. Say exactly
            // that instead of implying the payment failed.
            setPendingReason(res.error ?? "");
            setState("pending");
          }
        });
      },
      modal: {
        // The whole reason this page exists: closing the modal leaves the
        // customer inside the app, with nothing charged.
        ondismiss: () => setState("ready"),
      },
    });
    rzp.open();
  }, [keyId, subscriptionId, planName, interval, email, customerName, router]);

  React.useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing && window.Razorpay) {
      // Already loaded (a back-navigation to this page), so no `load` event is
      // coming. Cross a frame boundary rather than setting state straight from
      // the effect body, which would cascade a second render.
      const frame = requestAnimationFrame(() => setState("ready"));
      return () => cancelAnimationFrame(frame);
    }
    const script = existing ?? document.createElement("script");
    const onLoad = () => setState("ready");
    const onError = () => setState("failed");
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    return () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  }, []);

  // Open by itself the first time the script is ready, so the customer isn't
  // asked to click twice for something they already chose.
  React.useEffect(() => {
    if (state === "ready" && !autoOpened.current) {
      autoOpened.current = true;
      open();
    }
  }, [state, open]);

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <h1 className="text-[19px] font-semibold text-[var(--text)]">
        {state === "done" || state === "pending" || state === "activating"
          ? "Payment received"
          : `Subscribe to ${planName}`}
      </h1>

      {state === "loading" && (
        <p className="mt-2 text-[14px] text-[var(--text-muted)]">Opening secure checkout…</p>
      )}

      {state === "paying" && (
        <p className="mt-2 text-[14px] text-[var(--text-muted)]">
          Complete the payment in the Razorpay window. Close it to come back here — nothing is
          charged until you finish.
        </p>
      )}

      {state === "activating" && (
        <p className="mt-2 text-[14px] text-[var(--text-muted)]">
          Payment received — activating your plan…
        </p>
      )}

      {state === "pending" && (
        <>
          <p className="mt-2 text-[14px] text-[var(--text-muted)]">
            Your payment went through, but we haven&apos;t been able to activate the plan yet
            {pendingReason ? ` (${pendingReason})` : ""}. This usually clears within a minute — you
            have not been charged twice.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button
              onClick={() => {
                setState("activating");
                void confirmRazorpaySubscriptionAction(subscriptionId).then((res) => {
                  if (res.ok) {
                    setState("done");
                    router.push("/settings/billing?changed=1");
                  } else {
                    setPendingReason(res.error ?? "");
                    setState("pending");
                  }
                });
              }}
            >
              Check again
            </Button>
            <Button variant="ghost" onClick={() => router.push("/settings/billing")}>
              Back to billing
            </Button>
          </div>
        </>
      )}

      {state === "done" && (
        <p className="mt-2 text-[14px] text-[var(--text-muted)]">
          Thanks — your plan is active. Taking you back to billing…
        </p>
      )}

      {state === "ready" && (
        <>
          <p className="mt-2 text-[14px] text-[var(--text-muted)]">
            Nothing has been charged. You can complete the payment or go back — your current plan
            is unchanged either way.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={open}>Pay now</Button>
            <Button variant="ghost" onClick={() => router.push("/settings/billing")}>
              Back to billing
            </Button>
          </div>
        </>
      )}

      {state === "failed" && (
        <>
          <p className="mt-2 text-[14px] text-[var(--text-muted)]">
            We couldn&apos;t load the payment window. Check your connection or any ad blocker, then
            try again.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <Button variant="ghost" onClick={() => router.push("/settings/billing")}>
              Back to billing
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
