"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { promptReason } from "@/components/ui/confirm";
import { BODY_MAX, SAMPLE_VARS, SUBJECT_MAX, render, validateTemplate } from "@/lib/email-templates";
import { publishEmailTemplateAction, resetEmailTemplateAction, restoreEmailTemplateVersionAction, sendTestEmailAction } from "@/app/actions/admin-emails";

type Def = { key: string; label: string; when: string; placeholders: { name: string; hint: string; required?: boolean }[]; defaultSubject: string; defaultBody: string };
type Version = { id: string; version: number; isActive: boolean; note: string | null; by: string; at: string };
type Res = { ok: true; message: string } | { ok: false; error: string };

export function TemplateEditor({ def, active, history, canManage }: { def: Def; active: { id: string; version: number; subject: string; body: string } | null; history: Version[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState(active?.subject ?? def.defaultSubject);
  const [body, setBody] = React.useState(active?.body ?? def.defaultBody);
  const [busy, setBusy] = React.useState<string | null>(null);
  const errors = validateTemplate(def.key, subject, body);

  async function run(key: string, fn: () => Promise<Res>) {
    setBusy(key);
    try {
      const res = await fn();
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      toast({ title: "Something went wrong. Try again.", tone: "error" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-[var(--text)]">{def.label}</span>
            <Badge tone={active ? "primary" : "neutral"}>{active ? `version ${active.version}` : "built-in text"}</Badge>
          </div>
          <p className="text-[13px] text-[var(--text-muted)]">{def.when}</p>
        </div>
        <span className="text-[13px] text-[var(--text-muted)]">{open ? "Close" : "Edit"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--border)] p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label htmlFor={`sub-${def.key}`}>Subject</Label>
                <Input id={`sub-${def.key}`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={SUBJECT_MAX} disabled={!canManage} />
              </div>
              <div>
                <Label htmlFor={`body-${def.key}`}>Body (plain text)</Label>
                <Textarea id={`body-${def.key}`} rows={9} value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} disabled={!canManage} />
              </div>
              <ul className="space-y-0.5 text-[12.5px] text-[var(--text-muted)]">
                {def.placeholders.map((p) => (
                  <li key={p.name}>
                    <code className="rounded bg-[var(--bg-sunken)] px-1">{`{${p.name}}`}</code> {p.hint}
                    {p.required && " (required in the body)"}
                  </li>
                ))}
              </ul>
              {canManage && errors.length > 0 && <p role="status" className="text-[13px] text-[var(--danger)]">{errors[0]}</p>}
            </div>
            <div className="space-y-2">
              <p className="text-[12.5px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Preview with sample values</p>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-3">
                <p className="text-[13px] font-semibold text-[var(--text)]">{render(subject, SAMPLE_VARS) || "(no subject)"}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-[13.5px] text-[var(--text)]">{render(body, SAMPLE_VARS)}</p>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                loading={busy === "publish"}
                disabled={errors.length > 0 || (active ? active.subject === subject.trim() && active.body === body.trim() : subject.trim() === def.defaultSubject && body.trim() === def.defaultBody)}
                onClick={async () => {
                  const reason = await promptReason({ title: `Publish ${def.label}`, body: "This text is used for every email of this kind from now on. The previous version stays in the history.", confirmLabel: "Publish" });
                  if (reason) await run("publish", () => publishEmailTemplateAction({ key: def.key, subject, body }, reason));
                }}
              >
                Publish new version
              </Button>
              <Button variant="secondary" loading={busy === "test"} disabled={errors.length > 0} onClick={() => run("test", () => sendTestEmailAction(def.key, { subject, body }))}>
                Send a test to me
              </Button>
              {active && (
                <Button
                  variant="ghost"
                  loading={busy === "reset"}
                  onClick={async () => {
                    const reason = await promptReason({ title: "Back to the built-in text", body: "Stop using the published version and use the built-in text again? The versions stay in the history.", confirmLabel: "Reset" });
                    if (reason && (await run("reset", () => resetEmailTemplateAction(def.key, reason)))) {
                      setSubject(def.defaultSubject);
                      setBody(def.defaultBody);
                    }
                  }}
                >
                  Use the built-in text
                </Button>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12.5px] font-medium uppercase tracking-wide text-[var(--text-muted)]">History</p>
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
                {history.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
                    <span className="text-[var(--text)]">
                      Version {v.version} {v.isActive && <Badge tone="success">live</Badge>}
                      <span className="ml-2 text-[var(--text-muted)]">{v.by} · {v.at}{v.note ? ` · “${v.note}”` : ""}</span>
                    </span>
                    {canManage && !v.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `restore-${v.id}`}
                        onClick={async () => {
                          const reason = await promptReason({ title: `Restore version ${v.version}`, body: "Publish this version again as the newest one?", confirmLabel: "Restore" });
                          if (reason) await run(`restore-${v.id}`, () => restoreEmailTemplateVersionAction(v.id, reason));
                        }}
                      >
                        Restore
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
