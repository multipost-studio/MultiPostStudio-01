"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { exportReviewsAction, importReviewsAction } from "@/app/actions/admin-reviews";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from "@/lib/reviews/transfer";
import type { AdminFilters } from "@/lib/reviews/repo";

const SAMPLE = `authorName,authorRole,rating,title,body,status,featured,sourceUrl
Alex Rivera,Social lead at Acme,5,Saves us hours,"We schedule a week of posts in one sitting.",approved,no,https://example.com/review/123
`;

export function download(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export what the current filters show, as CSV or JSON. */
export function ExportButtons({ filters }: { filters: AdminFilters }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<null | "csv" | "json">(null);
  async function run(format: "csv" | "json") {
    setBusy(format);
    const { page: _page, ...f } = filters;
    void _page;
    const res = await exportReviewsAction(format, f);
    setBusy(null);
    if (res.ok) {
      download(res.filename, res.mime, res.text);
      toast({ title: `Exported ${res.count} review${res.count === 1 ? "" : "s"}`, description: "Matches the filters on screen.", tone: "success" });
    } else toast({ title: "Couldn't export", description: res.errors[0], tone: "error" });
  }
  return (
    <>
      <Button variant="secondary" size="sm" loading={busy === "csv"} onClick={() => void run("csv")}>
        <Download size={13} aria-hidden /> CSV
      </Button>
      <Button variant="secondary" size="sm" loading={busy === "json"} onClick={() => void run("json")}>
        <Download size={13} aria-hidden /> JSON
      </Button>
    </>
  );
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) setErrors([]);
  }, [open]);

  async function pick(file: File) {
    setErrors([]);
    if (file.size > MAX_IMPORT_FILE_BYTES) return setErrors([`The file is larger than ${Math.round(MAX_IMPORT_FILE_BYTES / 1000)} KB.`]);
    setBusy(true);
    const res = await importReviewsAction(await file.text());
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      toast({ title: res.message, tone: "success" });
      onClose();
      router.refresh();
    } else setErrors(res.errors);
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Import reviews" description={`CSV or JSON, up to ${MAX_IMPORT_ROWS} reviews. If any row has a problem, nothing is imported and the row is named.`}>
      <div className="space-y-4 text-[14px] text-[var(--text-muted)]">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Needs <strong className="text-[var(--text)]">authorName</strong> and <strong className="text-[var(--text)]">rating</strong> (1 to 5). Optional: authorRole, title, body, status, featured, sortOrder, sourceUrl, avatarUrl, adminReply, createdAt.
          </li>
          <li>Rows land as <em>pending</em> unless the file says otherwise. Reviews already here are skipped.</li>
          <li>Only import reviews you have the right to show, and keep the source link.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileRef.current?.click()} loading={busy}>
            <Upload size={14} aria-hidden /> Choose a file
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          <Button variant="ghost" size="sm" onClick={() => download("reviews-template.csv", "text/csv", SAMPLE)}>
            <Download size={13} aria-hidden /> Template
          </Button>
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
