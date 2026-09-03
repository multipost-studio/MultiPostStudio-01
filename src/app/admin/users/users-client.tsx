"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { importUsersAction } from "@/app/actions/admin";

export function ImportUsersButton() {
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [errs, setErrs] = React.useState<string[]>([]);
  const { toast } = useToast();
  const router = useRouter();

  async function run() {
    setBusy(true);
    setErrs([]);
    const res = await importUsersAction(csv);
    setBusy(false);
    setErrs(res.errors ?? []);
    toast({ title: res.ok ? res.message ?? "Imported" : "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok && !(res.errors ?? []).length) {
      setOpen(false);
      setCsv("");
      router.refresh();
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Import CSV</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import users"
        description="Paste CSV with columns: email,name (header row optional). New users are created unverified with a random password — they use “forgot password” to set one."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={run} loading={busy} disabled={!csv.trim()}>Import</Button>
          </>
        }
      >
        <textarea
          className="min-h-[180px] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px]"
          placeholder={"email,name\njane@acme.com,Jane Doe\nsam@acme.com,Sam Lee"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        {errs.length > 0 && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] p-2 text-[12px] text-[var(--danger)]">
            {errs.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
      </Modal>
    </>
  );
}
