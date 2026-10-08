"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createReviewAction, updateReviewAction } from "@/app/actions/admin-reviews";
import { adminReviewSchema, issuesOf, LIMITS, type ReviewRecord, type ReviewStatus } from "@/lib/reviews/model";

type Draft = {
  authorName: string;
  authorRole: string;
  avatarUrl: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  featured: boolean;
  sortOrder: number;
  sourceUrl: string;
  adminReply: string;
  adminNote: string;
};

const BLANK: Draft = { authorName: "", authorRole: "", avatarUrl: "", rating: 5, title: "", body: "", status: "pending", featured: false, sortOrder: 0, sourceUrl: "", adminReply: "", adminNote: "" };

const fromRecord = (r: ReviewRecord): Draft => ({
  authorName: r.authorName,
  authorRole: r.authorRole ?? "",
  avatarUrl: r.avatarUrl ?? "",
  rating: r.rating,
  title: r.title ?? "",
  body: r.body,
  status: r.status,
  featured: r.featured,
  sortOrder: r.sortOrder,
  sourceUrl: r.sourceUrl ?? "",
  adminReply: r.adminReply ?? "",
  adminNote: r.adminNote ?? "",
});

/** Add a review by hand, or edit one (a customer's included). `review === null` means add. */
export function ReviewForm({ open, review, onClose }: { open: boolean; review: ReviewRecord | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<Draft>(BLANK);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(review ? fromRecord(review) : BLANK);
      setErrors([]);
    }
  }, [open, review]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const fromApp = review?.source === "in_app";
  const noConsent = fromApp && !review?.publicConsent;

  async function save() {
    setErrors([]);
    const check = adminReviewSchema.safeParse(draft);
    if (!check.success) return setErrors(issuesOf(check.error));
    setBusy(true);
    const res = review ? await updateReviewAction(review.id, draft) : await createReviewAction(draft);
    setBusy(false);
    if (res.ok) {
      toast({ title: res.message, tone: "success" });
      onClose();
      router.refresh();
    } else setErrors(res.errors);
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={review ? "Edit review" : "Add a review"} description={review ? undefined : "For a review a customer sent you, or one you have permission to show. It counts as added by hand."}>
      <div className="space-y-4">
        {fromApp && (
          <p className="rounded-[12px] bg-[var(--info-soft)] px-3 py-2 text-[13px] text-[var(--text)]">
            Written by a customer{noConsent ? ", who chose not to publish it, so it can't go live" : ""}. Change their words only to fix a typo or remove personal details.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.authorName} maxLength={LIMITS.name} onChange={(e) => set("authorName", e.target.value)} />
          </Field>
          <Field label="Role or company (optional)">
            <Input value={draft.authorRole} maxLength={LIMITS.role} onChange={(e) => set("authorRole", e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <Field label="Rating">
            <Select value={draft.rating} onChange={(e) => set("rating", Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} star{n === 1 ? "" : "s"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Headline (optional)">
            <Input value={draft.title} maxLength={LIMITS.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
        </div>
        <Field label="Review" hint={`${draft.body.length}/${LIMITS.body}`}>
          <Textarea value={draft.body} rows={5} maxLength={LIMITS.body} onChange={(e) => set("body", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => set("status", e.target.value as ReviewStatus)}>
              <option value="pending">Pending</option>
              <option value="approved" disabled={noConsent}>
                Published
              </option>
              <option value="rejected">Rejected</option>
              <option value="hidden">Hidden</option>
            </Select>
          </Field>
          <Field label="Photo address (optional)" hint="https:// image">
            <Input value={draft.avatarUrl} onChange={(e) => set("avatarUrl", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Order" hint="Lower first">
            <Input type="number" value={draft.sortOrder} min={-1000} max={1000} onChange={(e) => set("sortOrder", Math.round(Number(e.target.value) || 0))} />
          </Field>
        </div>
        <Field label="Source link (optional)" hint="Where this review came from, for imported or hand-added reviews">
          <Input value={draft.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Public reply from the team (optional)" hint={`Shown under the review. ${draft.adminReply.length}/${LIMITS.reply}`}>
          <Textarea value={draft.adminReply} rows={2} maxLength={LIMITS.reply} onChange={(e) => set("adminReply", e.target.value)} />
        </Field>
        <Field label="Private note (optional)" hint="Only admins see this">
          <Input value={draft.adminNote} maxLength={LIMITS.note} onChange={(e) => set("adminNote", e.target.value)} />
        </Field>
        <Checkbox checked={draft.featured} onCheckedChange={(v) => set("featured", v)} label="Feature this review" description="Featured reviews are shown first on the landing page and /reviews." />
        {errors.length > 0 && (
          <p role="alert" className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-[13.5px] text-[var(--danger)]">
            {errors[0]}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {review ? "Save review" : "Add review"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
