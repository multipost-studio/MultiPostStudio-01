"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { bulkImportPostsAction } from "@/app/actions/posts";

const SAMPLE = `when,platform,body,title
2026-09-10 09:00,instagram,"New drop is live 🎉 link in bio",Launch day
2026-09-11 17:30,linkedin,"3 lessons from shipping v1 this week...",Build notes
,x,"Draft with no date — lands in drafts",`;

export function ImportPostsButton() {
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function run() {
    setBusy(true);
    const res = await bulkImportPostsAction(csv);
    setBusy(false);
    toast({ title: res.ok ? res.message ?? "Imported" : res.error ?? "Import failed", tone: res.ok ? "success" : "error" });
    if (res.ok) {
      setOpen(false);
      setCsv("");
      router.refresh();
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={14} /> Import CSV
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bulk import posts"
        description="One post per row. Columns: when, platform, body, title (header optional). Rows with a valid future date are scheduled; the rest become drafts. Needs a connected channel for each platform."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCsv(SAMPLE)}>Paste sample</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={run} loading={busy} disabled={!csv.trim()}>Import</Button>
          </>
        }
      >
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          className="font-mono text-[12px]"
          placeholder={SAMPLE}
        />
      </Modal>
    </>
  );
}
