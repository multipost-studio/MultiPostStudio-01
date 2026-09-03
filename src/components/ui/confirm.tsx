"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  /** What will happen — be specific about scope and consequences. */
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. Default true. */
  destructive?: boolean;
  /** Extra emphasized line, e.g. "This can't be undone." */
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

/* ---------------------------------------------------------------------------
 * App-wide imperative confirm — one dialog instance, awaited from anywhere.
 * ------------------------------------------------------------------------- */

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

// Module singleton so non-hook code (event handlers in plain functions) can
// call confirm() too. Set by the mounted provider.
let singleton: ConfirmFn | null = null;

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  React.useEffect(() => {
    singleton = confirm;
    return () => {
      if (singleton === confirm) singleton = null;
    };
  }, [confirm]);

  const close = (ok: boolean) =>
    setState((s) => {
      s?.resolve(ok);
      return null;
    });

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          {...state}
          open
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** Hook form: `const confirm = useConfirm(); if (await confirm({...})) {...}` */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  return ctx ?? confirmDestructive;
}

/** Imperative form for non-component code. Resolves false if no provider mounted. */
export const confirmDestructive: ConfirmFn = (opts) =>
  singleton ? singleton(opts) : Promise.resolve(false);
