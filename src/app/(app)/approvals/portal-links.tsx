"use client";

import * as React from "react";
import { Link2, Plus, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";
import { createPortalLinkAction, listPortalLinksAction, revokePortalLinkAction } from "@/app/actions/portal";
import { confirmDestructive } from "@/components/ui/confirm";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Link = { id: string; label: string; token: string; expiresAt: string | null; createdAt: string };

/**
 * Client review links only ever act on approval requests whose current
 * stage is gated to the "client" role (see actions/portal.ts) — creating one
 * here is safe by construction, not by trusting whoever holds the URL.
 */
export function PortalLinks({ initialLinks }: { initialLinks: Link[] }) {
  const { toast } = useToast();
  const [links, setLinks] = React.useState<Link[]>(initialLinks);
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [newUrl, setNewUrl] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const res = await listPortalLinksAction();
    if (res.ok && Array.isArray(res.data)) setLinks(res.data as Link[]);
  }, []);

  async function create() {
    if (!label.trim()) return;
    setPending(true);
    const res = await createPortalLinkAction({ label });
    setPending(false);
    if (res.ok && res.data && typeof res.data === "object" && "token" in res.data) {
      const url = `${window.location.origin}/portal/${(res.data as { token: string }).token}`;
      setNewUrl(url);
      setLabel("");
      await reload();
    } else {
      toast({ title: "Couldn't create link", description: res.error, tone: "error" });
    }
  }

  async function revoke(id: string, label: string) {
    const ok = await confirmDestructive({
      title: `Revoke “${label}”?`,
      body: "The client's link stops working immediately. In-progress reviews through it are closed.",
      confirmLabel: "Revoke link",
    });
    if (!ok) return;
    const res = await revokePortalLinkAction(id);
    if (res.ok) await reload();
    else toast({ title: "Couldn't revoke", description: res.error, tone: "error" });
  }

  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[14px] font-semibold text-[var(--text)]">Client review links</p>
          <p className="text-[12.5px] text-[var(--text-subtle)]">
            Share a link so a client can approve posts without a Cadence account. Only acts on stages gated to &quot;Client&quot;.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus size={13} /> New link
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="text-[13px] text-[var(--text-subtle)]">No active client links.</p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => {
            const expired = l.expiresAt ? new Date(l.expiresAt).getTime() < Date.now() : false;
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-[var(--text)]">
                  <Link2 size={13} className="shrink-0 text-[var(--text-subtle)]" />
                  <span className="truncate">{l.label}</span>
                  <span className="shrink-0 text-[12px] text-[var(--text-subtle)]">
                    {expired
                      ? "expired"
                      : l.expiresAt
                        ? `expires ${relativeTime(new Date(l.expiresAt))}`
                        : "never expires"}
                    {" · "}created {relativeTime(new Date(l.createdAt))}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Copy link for ${l.label}`}
                    onClick={async () => {
                      const done = await copyText(`${window.location.origin}/portal/${l.token}`);
                      toast({ title: done ? "Link copied" : "Copy failed — select and copy manually", tone: done ? "success" : "error" });
                    }}
                  >
                    <Copy size={13} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Revoke link for ${l.label}`} onClick={() => revoke(l.id, l.label)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setNewUrl(null);
        }}
        title="New client review link"
      >
        {newUrl ? (
          <div className="space-y-3">
            <p className="text-[13.5px] text-[var(--text-muted)]">Share this URL with your client — it needs no account.</p>
            <div className="flex items-center gap-2">
              <Input value={newUrl} readOnly aria-label="New client review link" />
              <Button
                size="sm"
                onClick={async () => {
                  const done = await copyText(newUrl);
                  toast({ title: done ? "Copied" : "Copy failed — select and copy manually", tone: done ? "success" : "error" });
                }}
              >
                <Copy size={13} /> Copy
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setOpen(false); setNewUrl(null); }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Client name, e.g. Acme Corp" />
            <Button size="sm" loading={pending} onClick={create}>
              Create link
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
