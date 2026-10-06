"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, History, Pencil, RotateCcw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/controls";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_LABELS, type PlatformRule, type RuleKind } from "@/lib/platform-rules";
import { resetPlatformRuleAction, updatePlatformRuleAction } from "@/app/actions/platform-rules";

export type RuleRow = PlatformRule & { edited: boolean };
export type RevisionRow = { id: string; ruleId: string; platform: string; by: string; at: string; reason: string; version: string | null; oldValue: string; newValue: string };

const KIND_TONE: Record<RuleKind, BadgeTone> = { HARD_LIMIT: "danger", API_LIMIT: "warning", ACCOUNT_LIMIT: "info", RECOMMENDATION: "neutral" };
const KIND_HELP: Record<RuleKind, string> = {
  HARD_LIMIT: "The platform enforces it. Blocks publishing.",
  API_LIMIT: "The publishing API enforces it. Blocks publishing.",
  ACCOUNT_LIMIT: "Depends on the connected account (e.g. X Premium). Blocks publishing.",
  RECOMMENDATION: "Best-practice advice. Never blocks publishing.",
};
const UNIT: Record<string, string> = { characters: "characters", graphemes: "graphemes", bytes: "bytes", utf16: "UTF-16 chars", x_weighted: "weighted chars", threads: "chars (emoji = bytes)" };

function valueText(r: PlatformRule): string {
  const n = r.value.toLocaleString("en-US");
  if (r.key.startsWith("hashtags")) return `${r.key === "hashtags.recommendedMax" ? "up to " : ""}${n} hashtag${r.value === 1 ? "" : "s"}`;
  if (r.key === "topicTags.max") return `${n} topic tag${r.value === 1 ? "" : "s"}`;
  if (r.key === "mentions.max") return `${n} mentions`;
  if (r.key === "links.max") return `${n} links`;
  return `${n} ${UNIT[r.countMethod ?? "characters"] ?? "characters"}`;
}

function statusOf(r: RuleRow): { label: string; tone: BadgeTone } {
  if (!r.enabled) return { label: "Disabled", tone: "neutral" };
  if (r.verification === "needs_verification") return { label: "Needs verification", tone: "warning" };
  return { label: r.edited ? "Active · edited" : "Active", tone: "success" };
}

function scope(r: PlatformRule): string {
  const parts = [r.tier ? `${r.tier} account` : null, r.contentTypes ? r.contentTypes.join(", ") : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "all content types";
}

export function PlatformRulesClient({ rows, revisions, readOnly }: { rows: RuleRow[]; revisions: RevisionRow[]; readOnly: boolean }) {
  const [platform, setPlatform] = React.useState("");
  const [editing, setEditing] = React.useState<RuleRow | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const platforms = [...new Set(rows.map((r) => r.platform))];
  const visible = rows.filter((r) => !platform || r.platform === platform);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Filter by platform" value={platform} onChange={(e) => setPlatform(e.target.value)} size="sm" className="w-auto">
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p] ?? p}
            </option>
          ))}
        </Select>
        <span className="text-[13px] text-[var(--text-subtle)]">{visible.length} rules</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          <History size={14} aria-hidden /> Change history ({revisions.length})
        </Button>
      </div>

      <Table label="Platform rules">
        <THead>
          <TR>
            <TH>Platform</TH>
            <TH>Rule</TH>
            <TH>Value</TH>
            <TH>Type</TH>
            <TH>Source</TH>
            <TH>Version</TH>
            <TH>Last verified</TH>
            <TH>Status</TH>
            <TH className="text-right">
              <span className="sr-only">Actions</span>
            </TH>
          </TR>
        </THead>
        <tbody>
          {visible.map((r) => {
            const st = statusOf(r);
            return (
              <TR key={r.id}>
                <TD className="whitespace-nowrap font-medium">{PLATFORM_LABELS[r.platform] ?? r.platform}</TD>
                <TD>
                  <p className="text-[14px] text-[var(--text)]">{r.label}</p>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {r.key} · {scope(r)}
                  </p>
                </TD>
                <TD className="whitespace-nowrap tabular-nums">{valueText(r)}</TD>
                <TD>
                  <Badge tone={KIND_TONE[r.kind]} title={KIND_HELP[r.kind]}>
                    {r.kind.replace("_", " ")}
                  </Badge>
                </TD>
                <TD className="max-w-[220px] text-[12.5px]">
                  {r.source.url ? (
                    <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-[var(--primary)] hover:underline">
                      <span className="line-clamp-2">{r.source.name}</span>
                      <ExternalLink size={11} className="mt-0.5 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <span className="line-clamp-2 text-[var(--text-muted)]">{r.source.name}</span>
                  )}
                </TD>
                <TD className="whitespace-nowrap tabular-nums">{r.version}</TD>
                <TD className="whitespace-nowrap tabular-nums text-[var(--text-muted)]">{r.lastVerifiedAt}</TD>
                <TD>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </TD>
                <TD className="text-right">
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${PLATFORM_LABELS[r.platform] ?? r.platform}: ${r.label}`}>
                      <Pencil size={13} aria-hidden /> Edit
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>

      {showHistory && <History_ revisions={revisions} />}
      {editing && <EditRuleModal rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function pickValue(json: string): { value?: number; enabled?: boolean; kind?: string; version?: string } {
  try {
    return JSON.parse(json) as { value?: number; enabled?: boolean; kind?: string; version?: string };
  } catch {
    return {};
  }
}

function History_({ revisions }: { revisions: RevisionRow[] }) {
  if (revisions.length === 0) return <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-4 text-[13.5px] text-[var(--text-muted)]">No changes yet. The built-in defaults are in force.</p>;
  return (
    <section aria-label="Rule change history" className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <ul className="divide-y divide-[var(--border)]">
        {revisions.map((r) => {
          const o = pickValue(r.oldValue);
          const n = pickValue(r.newValue);
          return (
            <li key={r.id} className="px-3 py-2.5 text-[13.5px]">
              <p className="text-[var(--text)]">
                <span className="font-medium">{PLATFORM_LABELS[r.platform] ?? r.platform}</span> · <code className="text-[12px]">{r.ruleId}</code>
              </p>
              <p className="mt-0.5 text-[var(--text-muted)]">
                {o.value !== n.value ? `Value ${o.value} → ${n.value}. ` : ""}
                {o.enabled !== n.enabled ? `${n.enabled ? "Enabled" : "Disabled"}. ` : ""}
                {o.kind !== n.kind ? `Type ${o.kind} → ${n.kind}. ` : ""}
                {r.version ? `Rule version ${r.version}. ` : ""}Reason: {r.reason}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
                {r.by} · {new Date(r.at).toLocaleString()}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EditRuleModal({ rule, onClose }: { rule: RuleRow; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState(String(rule.value));
  const [enabled, setEnabled] = React.useState(rule.enabled);
  const [kind, setKind] = React.useState<RuleKind>(rule.kind);
  const [verification, setVerification] = React.useState(rule.verification);
  const [sourceName, setSourceName] = React.useState(rule.source.name);
  const [sourceUrl, setSourceUrl] = React.useState(rule.source.url);
  const [version, setVersion] = React.useState(rule.version);
  const [markVerified, setMarkVerified] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "reset" | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function save() {
    setBusy("save");
    const res = await updatePlatformRuleAction({
      id: rule.id,
      value: Number(value),
      enabled,
      kind,
      verification,
      sourceName,
      sourceUrl,
      version,
      markVerified,
      reason,
    });
    setBusy(null);
    if (res.ok) {
      toast({ title: res.message, tone: "success" });
      router.refresh();
      onClose();
    } else {
      setErrors(res.fieldErrors ?? {});
      toast({ title: "Not saved", description: res.error, tone: "error" });
    }
  }

  async function reset() {
    setBusy("reset");
    const res = await resetPlatformRuleAction(rule.id, reason);
    setBusy(null);
    if (res.ok) {
      toast({ title: res.message, tone: "success" });
      router.refresh();
      onClose();
    } else {
      setErrors("fieldErrors" in res && res.fieldErrors ? res.fieldErrors : {});
      toast({ title: "Not reset", description: res.error, tone: "error" });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${PLATFORM_LABELS[rule.platform] ?? rule.platform}: ${rule.label}`}
      description={`${rule.key} · ${scope(rule)}`}
      size="md"
      footer={
        <>
          {rule.edited && (
            <Button variant="ghost" size="sm" className="mr-auto" onClick={reset} loading={busy === "reset"}>
              <RotateCcw size={13} aria-hidden /> Reset to default
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={busy === "save"}>
            Save change
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Value" error={errors.value}>
          <Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Rule version" hint="YYYY-MM" error={errors.version}>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026-10" />
        </Field>
        <Field label="Type" hint={KIND_HELP[kind]}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            {(Object.keys(KIND_HELP) as RuleKind[]).map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Verification" hint="Unverified rules only ever warn.">
          <Select value={verification} onChange={(e) => setVerification(e.target.value as typeof verification)}>
            <option value="verified">Verified against official docs</option>
            <option value="needs_verification">Needs verification</option>
          </Select>
        </Field>
        <Field label="Source name" className="sm:col-span-2">
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
        </Field>
        <Field label="Source URL" error={errors.sourceUrl} className="sm:col-span-2">
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="flex items-center gap-4 sm:col-span-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} label="Rule active" />
          <label className="flex items-center gap-2 text-[14px] text-[var(--text)]">
            <input type="checkbox" checked={markVerified} onChange={(e) => setMarkVerified(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Stamp “last verified” as today
          </label>
        </div>
        <Field label="Why is this changing?" hint="Required. Saved with the change and in the audit log." error={errors.reason} className="sm:col-span-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Instagram raised the hashtag limit (Help Center, Oct 2026)" />
        </Field>
      </div>
    </Modal>
  );
}
