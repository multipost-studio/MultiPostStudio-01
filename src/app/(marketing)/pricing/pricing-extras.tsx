import Link from "next/link";
import { Check, FileDown, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";

/** What every plan gets: built from the entry plan's real entitlements, so it can't drift from the product. */
export function IncludedInEveryPlan({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5 text-[14px] text-[var(--text-muted)]">
            <Check size={16} className="mt-0.5 shrink-0 text-[var(--success)]" aria-hidden />
            {i}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13.5px] text-[var(--text-subtle)]">
        Paid plans raise the limits above and add team features, deeper analytics and automation.
      </p>
    </div>
  );
}

const POINTS = [
  { icon: Lock, title: "Tokens encrypted at rest", body: "Connected-account tokens are stored with AES-256-GCM under a separate key." },
  { icon: KeyRound, title: "Passwords never stored", body: "Only salted hashes. Review and revoke your signed-in devices any time." },
  { icon: Users, title: "Isolated workspaces", body: "Every request is checked against your role and workspace before data is returned." },
  { icon: ShieldCheck, title: "HTTPS everywhere", body: "All traffic to and from the app is encrypted in transit." },
  { icon: FileDown, title: "Your data is yours", body: "Export it or ask us to delete it, whenever you like." },
];

/** Trust strip. Every claim here is stated in the privacy policy and true of the product as built. */
export function SecurityStrip() {
  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {POINTS.map((p) => (
          <li key={p.title} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p.icon size={18} className="text-[var(--primary)]" aria-hidden />
            <p className="mt-3 text-[14px] font-semibold text-[var(--text)]">{p.title}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--text-muted)]">{p.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-[var(--text-subtle)]">
        More in our <Link href="/security" className="font-medium text-[var(--primary)] hover:underline">security overview</Link> and{" "}
        <Link href="/legal/privacy" className="font-medium text-[var(--primary)] hover:underline">privacy policy</Link>.
      </p>
    </div>
  );
}

const CHIPS = ["No card to start", "Change or cancel anytime", "Export your data anytime", "Real INR prices, never converted"];

export function TrustChips({ showCurrency }: { showCurrency: boolean }) {
  return (
    <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--text-muted)]">
      {CHIPS.filter((c) => showCurrency || !c.startsWith("Real INR")).map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <Check size={14} className="text-[var(--success)]" aria-hidden />
          {c}
        </li>
      ))}
    </ul>
  );
}
