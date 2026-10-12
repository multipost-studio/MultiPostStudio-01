"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Lock, Plus, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AppLoader } from "@/components/ui/app-loader";
import {
  createPinterestBoardAction,
  getPinterestBoardsAction,
  setPinterestDefaultBoardAction,
  type BoardList,
} from "@/app/actions/pinterest";
import { PIN_BOARD_NAME_MAX } from "@/lib/integrations/pinterest";

/** Choose the default board for a connected Pinterest account, or create a new one. */
export function PinterestBoardsModal({ accountId, open, onClose }: { accountId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<BoardList | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const loading = open && !data && !error;

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    getPinterestBoardsAction(accountId, { fresh: true }).then((res) => {
      if (!live) return;
      if (res.ok && res.data) setData(res.data);
      else setError(res.error ?? "Couldn't load your boards");
    });
    return () => {
      live = false;
      setData(null);
      setError(null);
    };
  }, [open, accountId, reload]);

  async function choose(boardId: string) {
    setBusy(boardId);
    const res = await setPinterestDefaultBoardAction(accountId, boardId);
    setBusy(null);
    if (!res.ok) return toast({ title: "Couldn't set the default board", description: res.error, tone: "error" });
    toast({ title: "Default board saved", description: res.message, tone: "success" });
    setData((d) => (d ? { ...d, defaultBoardId: boardId } : d));
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    const res = await createPinterestBoardAction(accountId, name, "PUBLIC");
    setBusy(null);
    if (!res.ok || !res.data) return toast({ title: "Couldn't create the board", description: res.error, tone: "error" });
    toast({ title: res.message ?? "Board created", tone: "success" });
    setName("");
    setData(null);
    setReload((n) => n + 1);
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Pinterest boards" description="Pins go to the default board unless a post picks another one." size="lg">
      <div className="space-y-4 py-1">
        {loading && <AppLoader variant="modal" size="md" state="thinking" text="Loading your boards…" />}

        {error && !loading && (
          <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-[13px]">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
              <div>
                <p className="font-semibold text-[var(--danger)]">Unable to load boards</p>
                <p className="mt-0.5 text-[var(--text-muted)]">{error}</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setError(null); setReload((n) => n + 1); }}>
                  <RefreshCw size={13} className="mr-1.5" /> Try again
                </Button>
              </div>
            </div>
          </div>
        )}

        {!loading && data && (
          <>
            {data.cached && <p className="text-[12px] text-[var(--text-subtle)]">Showing the last list we saved. Pinterest may have newer boards.</p>}
            {data.boards.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-4 text-center text-[13px] text-[var(--text-muted)]">
                No boards yet. Create your first one below.
              </p>
            ) : (
              <ul className="max-h-[320px] divide-y divide-[var(--border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
                {data.boards.map((b) => {
                  const isDefault = b.id === data.defaultBoardId;
                  return (
                    <li key={b.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-[var(--text)]">
                          {b.name}
                          {b.privacy === "SECRET" && <Lock size={11} className="shrink-0 text-[var(--text-subtle)]" aria-label="Secret board" />}
                        </p>
                        <p className="text-[11.5px] text-[var(--text-subtle)]">{b.pinCount} Pin{b.pinCount === 1 ? "" : "s"}</p>
                      </div>
                      {isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--primary)]">
                          <Check size={12} /> Default
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" loading={busy === b.id} disabled={busy !== null} onClick={() => choose(b.id)}>
                          Make default
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <form onSubmit={create} className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]/60 p-3">
              <p className="text-[12.5px] font-semibold text-[var(--text)]">Create a board</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label htmlFor="pin-new-board" className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">Name</label>
                  <Input id="pin-new-board" size="sm" maxLength={PIN_BOARD_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring recipes" />
                </div>
                <Button type="submit" size="sm" variant="primary" loading={busy === "create"} disabled={busy !== null || name.trim() === ""}>
                  <Plus size={13} className="mr-1" /> Create
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
