"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REASON_MAX, REASON_MIN } from "@/lib/admin-reason";

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

export type ReasonOptions = { title: string; body: React.ReactNode; confirmLabel?: string };

/** Asks for a written reason (the same limits the server enforces). Confirm stays disabled until it is long enough. */
export function ReasonDialog({ title, body, confirmLabel = "Confirm", onCancel, onConfirm }: ReasonOptions & { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  const ready = reason.trim().length >= REASON_MIN;
  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm(reason.trim());
        }}
        className="space-y-3"
      >
        <div className="text-[14px] leading-relaxed text-[var(--text-muted)]">{body}</div>
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-[var(--text)]">Reason (recorded in the audit log)</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} placeholder={`At least ${REASON_MIN} characters`} autoFocus />
        </label>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------------------
 * App-wide imperative confirm — one dialog instance, awaited from anywhere.
 * ------------------------------------------------------------------------- */

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
/** Resolves with the reason, or null if the person cancelled. */
type ReasonFn = (opts: ReasonOptions) => Promise<string | null>;
let reasonSingleton: ReasonFn | null = null;

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

  const [reasonState, setReasonState] = React.useState<(ReasonOptions & { resolve: (r: string | null) => void }) | null>(null);
  const ask = React.useCallback<ReasonFn>((opts) => new Promise<string | null>((resolve) => setReasonState({ ...opts, resolve })), []);
  React.useEffect(() => {
    reasonSingleton = ask;
    return () => {
      if (reasonSingleton === ask) reasonSingleton = null;
    };
  }, [ask]);
  const closeReason = (r: string | null) =>
    setReasonState((s) => {
      s?.resolve(r);
      return null;
    });

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
      {reasonState && <ReasonDialog title={reasonState.title} body={reasonState.body} confirmLabel={reasonState.confirmLabel} onCancel={() => closeReason(null)} onConfirm={(r) => closeReason(r)} />}
    </ConfirmContext.Provider>
  );
}

/** Hook form: `const confirm = useConfirm(); if (await confirm({...})) {...}` */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  return ctx ?? confirmDestructive;
}

/** Ask for a written reason before a sensitive action. Resolves null if cancelled (or if no provider is mounted, so nothing runs without a reason). */
export const promptReason: ReasonFn = (opts) => (reasonSingleton ? reasonSingleton(opts) : Promise.resolve(null));

/** Imperative form for non-component code. Resolves false if no provider mounted. */
export const confirmDestructive: ConfirmFn = (opts) =>
  singleton ? singleton(opts) : Promise.resolve(false);
