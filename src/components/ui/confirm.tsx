"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  /** What will happen — be specific about scope and consequences. */
  body: React.ReactNode;
  /** Confirm button label. Default "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. Default true. */
  destructive?: boolean;
  /** Extra line, e.g. "This can't be undone." Rendered emphasized. */
  irreversibleNote?: string;
};

/**
 * Controlled confirmation dialog for destructive actions. Clear hierarchy:
 * what happens → whether it can be undone → Cancel / destructive confirm.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  loading,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  irreversibleNote,
}: ConfirmOptions & {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[14px] leading-relaxed text-[var(--text-muted)]">{body}</div>
      {irreversibleNote && (
        <p className="mt-3 text-[13px] font-medium text-[var(--danger)]">{irreversibleNote}</p>
      )}
    </Modal>
  );
}

/**
 * Hook form: `const confirm = useConfirm()` then
 * `if (await confirm({ title, body, ... })) { ...do it... }`.
 * Render `confirm.dialog` once anywhere in the component tree.
 */
export function useConfirm() {
  const [state, setState] = React.useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const close = React.useCallback(
    (ok: boolean) => {
      setState((s) => {
        s?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const dialog = state ? (
    <ConfirmDialog
      {...state}
      open
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return Object.assign(confirm, { dialog });
}
