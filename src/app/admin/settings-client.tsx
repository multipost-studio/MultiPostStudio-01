"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/controls";
import { Input, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSiteSettingsAction } from "@/app/actions/admin";
import { PLAN_KEYS } from "@/lib/constants";
import type { SiteSettings } from "@/lib/settings";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

export function SettingsForm({ initial }: { initial: SiteSettings }) {
  const router = useRouter();
  const { toast } = useToast();
  const [s, setS] = React.useState<SiteSettings>(initial);
  const [saving, setSaving] = React.useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const res = await updateSiteSettingsAction(s);
    setSaving(false);
    toast({ title: res.ok ? res.message ?? "Saved" : "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Access</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Row label="Public sign-up" hint="When off, /signup is blocked and returns a notice.">
            <Switch checked={s.signupEnabled} onCheckedChange={(v) => set("signupEnabled", v)} srLabel="Public sign-up" />
          </Row>
          <Row label="Maintenance mode" hint="Non-admins see the maintenance message instead of the app.">
            <Switch checked={s.maintenanceMode} onCheckedChange={(v) => set("maintenanceMode", v)} srLabel="Maintenance mode" />
          </Row>
          <Field label="Maintenance message">
            <Input value={s.maintenanceMessage} onChange={(e) => set("maintenanceMessage", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Announcement banner</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Row label="Show banner" hint="Displayed at the top of every marketing + app page.">
            <Switch checked={s.announcementEnabled} onCheckedChange={(v) => set("announcementEnabled", v)} srLabel="Show announcement" />
          </Row>
          <Field label="Text">
            <Input value={s.announcementText} onChange={(e) => set("announcementText", e.target.value)} placeholder="New: Bluesky publishing is live 🎉" />
          </Field>
          <Field label="Tone">
            <Select value={s.announcementTone} onChange={(e) => set("announcementTone", e.target.value as SiteSettings["announcementTone"])}>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="success">success</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Defaults & limits</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Default plan for new sign-ups">
            <Select value={s.defaultPlanKey} onChange={(e) => set("defaultPlanKey", e.target.value as SiteSettings["defaultPlanKey"])}>
              {PLAN_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Field>
          <Field label="AI actions per minute per user">
            <Input
              type="number"
              value={s.aiRateLimitPerMin}
              onChange={(e) => set("aiRateLimitPerMin", Number(e.target.value))}
            />
          </Field>
          <Field label="Support email">
            <Input value={s.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
          </Field>
          <Field label="Site tagline">
            <Input value={s.siteTagline} onChange={(e) => set("siteTagline", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Affiliate program</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Row label="Enabled" hint="Turns the /affiliate page, application flow and commission engine on or off.">
            <Switch checked={s.affiliateEnabled} onCheckedChange={(v) => set("affiliateEnabled", v)} srLabel="Affiliate program" />
          </Row>
          <Row label="Application required" hint="Off = anyone who applies is approved instantly.">
            <Switch
              checked={s.affiliateApplicationRequired}
              onCheckedChange={(v) => set("affiliateApplicationRequired", v)}
              srLabel="Application required"
            />
          </Row>
          {s.affiliateApplicationRequired && (
            <Row label="Auto-approve applications" hint="Skip manual review even though applications are required.">
              <Switch
                checked={s.affiliateAutoApprove}
                onCheckedChange={(v) => set("affiliateAutoApprove", v)}
                srLabel="Auto-approve applications"
              />
            </Row>
          )}
          <Field label="Default commission type" hint="Applied to newly-approved affiliates — each affiliate's rate can still be edited individually.">
            <Select
              value={s.affiliateDefaultCommissionType}
              onChange={(e) => set("affiliateDefaultCommissionType", e.target.value as SiteSettings["affiliateDefaultCommissionType"])}
            >
              <option value="percent_recurring">Percent — recurring</option>
              <option value="percent_once">Percent — one-time</option>
              <option value="fixed_recurring">Fixed amount — recurring</option>
              <option value="fixed_once">Fixed amount — one-time</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default commission rate (%)">
              <Input
                type="number"
                value={s.affiliateDefaultCommissionRate}
                onChange={(e) => set("affiliateDefaultCommissionRate", Number(e.target.value))}
              />
            </Field>
            <Field label="Default fixed amount (minor units)">
              <Input
                type="number"
                value={s.affiliateDefaultFixedAmount}
                onChange={(e) => set("affiliateDefaultFixedAmount", Number(e.target.value))}
              />
            </Field>
            <Field label="Recurring months (0 = unlimited)">
              <Input
                type="number"
                value={s.affiliateDefaultRecurringMonths}
                onChange={(e) => set("affiliateDefaultRecurringMonths", Number(e.target.value))}
              />
            </Field>
            <Field label="Attribution cookie (days)">
              <Input
                type="number"
                value={s.affiliateDefaultCookieDays}
                onChange={(e) => set("affiliateDefaultCookieDays", Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Payout threshold (minor units)">
            <Input
              type="number"
              value={s.affiliateDefaultPayoutThreshold}
              onChange={(e) => set("affiliateDefaultPayoutThreshold", Number(e.target.value))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Transactional email</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12px] text-[var(--text-subtle)]">Placeholders: <code>{"{name}"}</code>, <code>{"{link}"}</code>.</p>
          <Field label="Verification — subject">
            <Input value={s.emailVerifySubject} onChange={(e) => set("emailVerifySubject", e.target.value)} />
          </Field>
          <Field label="Verification — body">
            <textarea
              className="min-h-[80px] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[14px]"
              value={s.emailVerifyBody}
              onChange={(e) => set("emailVerifyBody", e.target.value)}
            />
          </Field>
          <Field label="Password reset — subject">
            <Input value={s.emailResetSubject} onChange={(e) => set("emailResetSubject", e.target.value)} />
          </Field>
          <Field label="Password reset — body">
            <textarea
              className="min-h-[80px] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[14px]"
              value={s.emailResetBody}
              onChange={(e) => set("emailResetBody", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} loading={saving} disabled={!dirty}>
          {dirty ? "Save changes" : "Saved"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium text-[var(--text)]">{label}</p>
        {hint && <p className="text-[12px] text-[var(--text-subtle)]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
