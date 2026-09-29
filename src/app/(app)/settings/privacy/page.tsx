import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { SettingsSection } from "../_form";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { RequestButton, ComplaintForm, WithdrawAffiliateButton } from "./privacy-client";

export const metadata: Metadata = { title: "Privacy & Data" };

const STATUS_TONE = { submitted: "neutral", in_progress: "info", completed: "success", rejected: "danger" } as const;

export default async function PrivacySettingsPage() {
  const user = await requireUser();
  const [requests, affiliate] = await Promise.all([
    db.privacyRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.affiliate.findUnique({ where: { userId: user.id }, select: { status: true } }),
  ]);

  return (
    <>
      <SettingsSection
        title="Your data"
        description="Request a copy of your data, ask us to correct something, or request deletion. Most day-to-day changes — your name, password, connected accounts — are already self-service elsewhere in Settings; use these for anything that isn't."
      >
        <div className="flex flex-wrap gap-2">
          <RequestButton type="access" label="Request my data" />
          <RequestButton type="correction" label="Request a correction" />
          <RequestButton type="erasure" label="Request deletion" />
        </div>
      </SettingsSection>

      {affiliate && affiliate.status !== "suspended" && affiliate.status !== "terminated" && (
        <SettingsSection
          title="Consent"
          description="You're enrolled in the Affiliate Program, the one place in the app where you gave a separate, explicit opt-in beyond creating your account."
        >
          <WithdrawAffiliateButton />
        </SettingsSection>
      )}

      <SettingsSection title="Raise a complaint" description="Tell us if something about how your data is handled concerns you.">
        <ComplaintForm />
      </SettingsSection>

      <SettingsSection title="Request status" description="Every request above is tracked here until it's resolved.">
        {requests.length === 0 ? (
          <p className="text-[14px] text-[var(--text-subtle)]">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-[14px]">
                <div>
                  <p className="font-medium text-[var(--text)]">{r.type.replace("_", " ")}</p>
                  {r.details && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{r.details}</p>}
                  {r.resolutionNote && (
                    <p className="mt-1 text-[13px] text-[var(--text-subtle)]">Response: {r.resolutionNote}</p>
                  )}
                  <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">Filed {formatDate(r.createdAt)}</p>
                </div>
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <p className="text-[13px] text-[var(--text-subtle)]">
        See our <Link href="/legal/dpdp-notice" className="text-[var(--primary)] hover:underline">Data Processing Notice</Link> for
        what we process and why.
      </p>
    </>
  );
}
