"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { approveAiAccessAction, denyAiAccessAction } from "@/app/actions/mcp-oauth";

type Scope = { key: string; label: string; description: string; write: boolean };

export function ConsentForm({
  requestId,
  clientName,
  returnHost,
  knownApp,
  email,
  targets,
  scopes,
  initialScopes,
}: {
  requestId: string;
  clientName: string;
  returnHost: string;
  /** True for assistants we recognise (Claude, ChatGPT, localhost tools, known desktop apps). */
  knownApp: boolean;
  email: string;
  targets: { value: string; label: string }[];
  scopes: Scope[];
  initialScopes: string[];
}) {
  const [target, setTarget] = React.useState(targets[0]?.value ?? "");
  const [picked, setPicked] = React.useState<string[]>(initialScopes);
  const [busy, setBusy] = React.useState<"allow" | "deny" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  async function finish(kind: "allow" | "deny") {
    setBusy(kind);
    setError(null);
    let res: { ok: boolean; error?: string; redirectTo?: string };
    try {
      if (kind === "allow") {
        const fd = new FormData();
        fd.set("request", requestId);
        fd.set("target", target);
        picked.forEach((s) => fd.append("scopes", s));
        res = await approveAiAccessAction(fd);
      } else {
        res = await denyAiAccessAction(requestId);
      }
    } catch {
      res = { ok: false, error: "Something went wrong. Try again." };
    }
    if (res.ok && res.redirectTo) {
      setLeaving(true);
      // A full navigation, so app addresses such as cursor:// open the desktop app too.
      window.location.assign(res.redirectTo);
      return;
    }
    setBusy(null);
    setError(res.error ?? "Something went wrong. Try again.");
  }

  const writes = scopes.filter((s) => s.write && picked.includes(s.key));
  const readsInbox = picked.includes("inbox:read");

  if (leaving) {
    return (
      <p role="status" className="text-center text-[14px] text-[var(--text-muted)]">
        Returning to {clientName}… You can close this tab if nothing happens.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-[18px] font-semibold text-[var(--text)]">Connect {clientName} to MultiPost Studio?</h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--text-muted)]">
        Signed in as <span className="font-medium text-[var(--text)]">{email}</span>. After you allow it, you&apos;ll be sent back to{" "}
        <span className="font-medium text-[var(--text)]">{returnHost}</span>. The name &ldquo;{clientName}&rdquo; is chosen by the app itself and isn&apos;t verified, so check the address.
      </p>
      {!knownApp && (
        <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] text-[var(--text)]">
          We don&apos;t recognise <span className="font-medium">{returnHost}</span>. Only continue if you started this connection yourself, from an app you trust.
        </p>
      )}

      <div className="mt-5">
        <label htmlFor="grant-target" className="mb-1.5 block text-[14px] font-medium text-[var(--text)]">
          What can it use?
        </label>
        <Select id="grant-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-1.5 text-[14px] font-medium text-[var(--text)]">What can it do?</legend>
        <div className="space-y-2.5">
          {scopes.map((s) => (
            <div key={s.key}>
              <Checkbox
                checked={picked.includes(s.key)}
                onCheckedChange={(v) => setPicked((c) => (v ? [...new Set([...c, s.key])] : c.filter((x) => x !== s.key)))}
                label={s.label}
              />
              <p className="ml-7 text-[12.5px] text-[var(--text-subtle)]">{s.description}</p>
            </div>
          ))}
        </div>
      </fieldset>

      {writes.length > 0 && (
        <p role="note" className="mt-4 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] text-[var(--text)]">
          This lets {clientName} change things for you. It can never publish immediately or reply to people, and every change is logged in your activity.
        </p>
      )}
      {readsInbox && writes.length > 0 && (
        <p role="note" className="mt-3 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] text-[var(--text)]">
          Reading your inbox together with the right to change things is risky: a stranger&apos;s comment could try to steer the assistant. Untick one of them unless you need both.
        </p>
      )}
      <p className="mt-4 text-[12.5px] text-[var(--text-subtle)]">You can disconnect it any time in Integrations → AI assistants.</p>

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => finish("deny")} disabled={busy !== null}>
          Cancel
        </Button>
        <Button onClick={() => finish("allow")} loading={busy === "allow"} disabled={busy !== null || picked.length === 0}>
          Allow
        </Button>
      </div>
    </div>
  );
}
