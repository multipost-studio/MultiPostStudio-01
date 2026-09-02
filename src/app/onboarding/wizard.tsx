"use client";

import * as React from "react";
import { useActionState } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { INDUSTRIES, GOALS, PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import { completeOnboardingAction } from "@/app/actions/workspace";

const ROLES = [
  { key: "creator", label: "Creator", desc: "Personal brand, influencer, solo" },
  { key: "business", label: "Business", desc: "Small business or startup" },
  { key: "agency", label: "Agency", desc: "Managing multiple clients" },
  { key: "marketing_team", label: "Marketing team", desc: "In-house team at a company" },
  { key: "enterprise", label: "Enterprise", desc: "Large org, many stakeholders" },
];
const TEAM_SIZES = ["Just me", "2–5", "6–20", "21–50", "50+"];

export function OnboardingWizard({ name }: { name: string }) {
  const [step, setStep] = React.useState(0);
  const [role, setRole] = React.useState("");
  const [orgName, setOrgName] = React.useState("");
  const [industry, setIndustry] = React.useState(INDUSTRIES[0]);
  const [teamSize, setTeamSize] = React.useState(TEAM_SIZES[0]);
  const [platforms, setPlatforms] = React.useState<string[]>([]);
  const [goals, setGoals] = React.useState<string[]>([]);
  const [state, action, pending] = useActionState(completeOnboardingAction, { ok: false } as { ok: boolean; error?: string });

  const steps = ["Your role", "Your brand", "Platforms", "Goals", "Review"];
  const canNext =
    (step === 0 && role) ||
    (step === 1 && orgName.trim().length > 1) ||
    (step === 2 && platforms.length > 0) ||
    (step === 3 && goals.length > 0) ||
    step === 4;

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <span className="text-[13px] text-[var(--text-subtle)]">
          Step {step + 1} of {steps.length}
        </span>
      </div>

      <div className="mb-6 flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-[var(--primary)]" : "bg-[var(--bg-sunken)]")}
          />
        ))}
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        {step === 0 && (
          <>
            <h1 className="text-lg font-semibold text-[var(--text)]">Welcome, {name.split(" ")[0]} 👋</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">What best describes you?</p>
            <div className="mt-4 space-y-2">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRole(r.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[var(--radius-md)] border p-3 text-left transition-colors",
                    role === r.key ? "border-[var(--primary)] bg-[var(--primary-soft)]/40" : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  <div>
                    <p className="text-[15px] font-medium text-[var(--text)]">{r.label}</p>
                    <p className="text-[13px] text-[var(--text-muted)]">{r.desc}</p>
                  </div>
                  <span className={cn("h-4 w-4 rounded-full border-2", role === r.key ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)]")} />
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-lg font-semibold text-[var(--text)]">Tell us about your brand</h1>
            <div className="mt-4 space-y-4">
              <Field label="Company / brand name">
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Co" autoFocus />
              </Field>
              <Field label="Industry">
                <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                  {INDUSTRIES.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Team size">
                <Select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                  {TEAM_SIZES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-lg font-semibold text-[var(--text)]">Which platforms do you use?</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">Pick all that apply — you&apos;ll connect them next.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PLATFORM_KEYS.map((p) => (
                <button
                  key={p}
                  onClick={() => toggle(platforms, p, setPlatforms)}
                  className={cn(
                    "rounded-[var(--radius-md)] border p-3 text-[14px] font-medium transition-colors",
                    platforms.includes(p)
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/40 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  {PLATFORMS[p].label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-lg font-semibold text-[var(--text)]">What are your main goals?</h1>
            <div className="mt-4 space-y-2">
              {GOALS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => toggle(goals, g.key, setGoals)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[var(--radius-md)] border p-3 text-left text-[14px] font-medium transition-colors",
                    goals.includes(g.key)
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/40 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  {g.label}
                  <span className={cn("h-4 w-4 rounded border-2", goals.includes(g.key) ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)]")} />
                </button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-lg font-semibold text-[var(--text)]">You&apos;re all set</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">We&apos;ll personalize your workspace based on this.</p>
            <dl className="mt-4 space-y-2 text-[14px]">
              {[
                ["Role", ROLES.find((r) => r.key === role)?.label],
                ["Brand", orgName],
                ["Industry", industry],
                ["Team size", teamSize],
                ["Platforms", platforms.map((p) => PLATFORMS[p as keyof typeof PLATFORMS].label).join(", ")],
                ["Goals", goals.map((g) => GOALS.find((x) => x.key === g)?.label).join(", ")],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4 border-b border-[var(--border)] py-1.5">
                  <dt className="text-[var(--text-muted)]">{k}</dt>
                  <dd className="text-right font-medium text-[var(--text)]">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {state.error && <p className="mt-3 text-[13px] text-[var(--danger)]">{state.error}</p>}

            <form action={action} className="mt-5">
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="orgName" value={orgName} />
              <input type="hidden" name="industry" value={industry} />
              <input type="hidden" name="teamSize" value={teamSize} />
              <input type="hidden" name="platforms" value={JSON.stringify(platforms)} />
              <input type="hidden" name="goals" value={JSON.stringify(goals)} />
              <Button type="submit" className="w-full" loading={pending}>
                Create my workspace
              </Button>
            </form>
          </>
        )}

        {step < 4 && (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              Back
            </Button>
            <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
