"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { FIELD_MAX } from "@/lib/feedback";

/**
 * "Share feedback" — two questions, sent as a support ticket.
 *
 * The page path is captured automatically. It is the single most useful thing
 * for triage and the one thing a person reporting a problem never thinks to
 * include.
 *
 * `storageEnabled` decides whether an attachment is offered at all: uploads
 * throw on serverless without object storage configured, so the control is
 * hidden rather than shown as a button that fails.
 */
export function FeedbackButton({ storageEnabled = false }: { storageEnabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [goal, setGoal] = React.useState("");
  const [problem, setProblem] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const { toast } = useToast();
  const pathname = usePathname();

  const canSend = goal.trim().length > 2 && problem.trim().length > 2;

  function reset() {
    setOpen(false);
    setGoal("");
    setProblem("");
    setFile(null);
    setDragging(false);
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        title="Share feedback"
        aria-label="Share feedback"
      >
        <MessageSquare size={15} />
        <span className="hidden sm:inline">Share feedback</span>
      </Button>

      <Modal
        open={open}
        onClose={reset}
        title="What would help MultiPost Studio work better for you?"
        description="Something broken, or an idea — both are useful."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button size="sm" type="submit" form="feedback" loading={pending} disabled={!canSend}>
              Send feedback
            </Button>
          </>
        }
      >
        <form
          id="feedback"
          className="space-y-4"
          action={async (fd) => {
            if (file) fd.set("attachment", file);
            fd.set("context", pathname ?? "");
            setPending(true);
            // A rejected action (a network drop, or a server error) would
            // otherwise leave the button spinning forever with nothing said,
            // and the words the person typed still unsent.
            try {
              const res = await submitFeedbackAction(null, fd);
              toast({
                title: res.ok ? res.message ?? "Sent" : "Couldn't send",
                description: res.error,
                tone: res.ok ? "success" : "error",
              });
              if (res.ok) reset();
            } catch {
              toast({
                title: "Couldn't send",
                description: "Something went wrong on our side. Your text is still here — try again.",
                tone: "error",
              });
            } finally {
              setPending(false);
            }
          }}
        >
          <Counted
            name="goal"
            label="What were you trying to do?"
            value={goal}
            onChange={setGoal}
            placeholder="Schedule a carousel to Instagram for Friday morning…"
          />
          <Counted
            name="problem"
            label="What got in your way, and what might help?"
            value={problem}
            onChange={setProblem}
            placeholder="The publish button didn't respond, and there was no error…"
          />

          {storageEnabled && (
            <div>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed px-3 py-5 text-center transition-colors ${
                  dragging
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]/40"
                    : "border-[var(--border)] hover:border-[var(--primary)]"
                }`}
              >
                <ImagePlus size={16} className="text-[var(--text-subtle)]" />
                <span className="text-[13px] text-[var(--text-muted)]">
                  {file ? file.name : "Drag & drop a screenshot, or click to choose"}
                </span>
                <span className="text-[12px] text-[var(--text-subtle)]">PNG, JPEG, WebP or GIF · up to 5 MB</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="mt-1.5 text-[12px] text-[var(--text-subtle)] underline hover:text-[var(--text)]"
                >
                  Remove attachment
                </button>
              )}
            </div>
          )}

          <p className="text-[12px] text-[var(--text-subtle)]">
            We&apos;ll include the page you&apos;re on ({pathname}) so we can find the problem faster.
          </p>
        </form>
      </Modal>
    </>
  );
}

/** A textarea with the character counter the limit is actually enforced at. */
function Counted({
  name,
  label,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const over = value.length > FIELD_MAX;
  return (
    <Field label={label}>
      <div>
        <textarea
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          maxLength={FIELD_MAX}
          required
          className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)]"
        />
        <p
          className={`mt-1 text-right text-[12px] tabular-nums ${
            over ? "text-[var(--danger)]" : "text-[var(--text-subtle)]"
          }`}
        >
          {value.length}/{FIELD_MAX}
        </p>
      </div>
    </Field>
  );
}
