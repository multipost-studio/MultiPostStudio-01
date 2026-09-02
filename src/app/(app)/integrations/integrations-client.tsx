"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import {
  connectAccountAction,
  connectBlueskyAction,
  reconnectAccountAction,
  disconnectAccountAction,
} from "@/app/actions/integrations";

export function ConnectAccount({ providers }: { providers: Record<string, boolean> }) {
  const [open, setOpen] = React.useState(false);
  const [platform, setPlatform] = React.useState<string>("bluesky");
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const mode: "oauth" | "bluesky" | "stub" =
    platform === "bluesky" ? "bluesky" : providers[platform] ? "oauth" : "stub";

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plug size={15} /> Connect account
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connect a social account"
        description="Real OAuth where the platform's app credentials are configured. Bluesky uses an app password. Others fall back to a manual entry for the demo."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            {mode === "oauth" ? (
              <Button size="sm" asChild>
                <a href={`/api/oauth/${platform}/start`}>
                  Continue with {PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform}
                </a>
              </Button>
            ) : (
              <Button size="sm" type="submit" form="connect" loading={pending}>
                {mode === "bluesky" ? "Connect Bluesky" : "Connect (demo)"}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Platform">
            <Select name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORM_KEYS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORMS[p].label}
                  {p === "bluesky" ? " — real" : providers[p] ? " — real (OAuth)" : " — demo"}
                </option>
              ))}
            </Select>
          </Field>

          {mode === "oauth" && (
            <p className="text-[13px] text-[var(--text-muted)]">
              You&apos;ll be sent to {PLATFORMS[platform as keyof typeof PLATFORMS]?.label} to authorize Cadence, then
              back here.
            </p>
          )}

          {mode === "bluesky" && (
            <form
              id="connect"
              className="space-y-3"
              action={async (fd) => {
                setPending(true);
                const res = await connectBlueskyAction(null, fd);
                setPending(false);
                toast({
                  title: res.ok ? res.message ?? "Connected" : "Failed",
                  description: res.error,
                  tone: res.ok ? "success" : "error",
                });
                if (res.ok) { setOpen(false); router.refresh(); }
              }}
            >
              <Field label="Handle">
                <Input name="identifier" required placeholder="you.bsky.social" />
              </Field>
              <Field label="App password">
                <Input name="appPassword" type="password" required placeholder="xxxx-xxxx-xxxx-xxxx" />
              </Field>
              <p className="text-[12px] text-[var(--text-subtle)]">
                Create one at bsky.app → Settings → App Passwords. Not your main password.
              </p>
            </form>
          )}

          {mode === "stub" && (
            <form
              id="connect"
              className="space-y-3"
              action={async (fd) => {
                setPending(true);
                const res = await connectAccountAction(null, fd);
                setPending(false);
                toast({
                  title: res.ok ? res.message ?? "Connected" : "Failed",
                  description: res.error,
                  tone: res.ok ? "success" : "error",
                });
                if (res.ok) { setOpen(false); router.refresh(); }
              }}
            >
              <input type="hidden" name="platform" value={platform} />
              <Field label="Account handle">
                <Input name="handle" required placeholder="@yourbrand" />
              </Field>
              <p className="text-[12px] text-[var(--text-subtle)]">
                No OAuth app configured for {PLATFORMS[platform as keyof typeof PLATFORMS]?.label} — this creates a
                placeholder connection (no real publishing). Add credentials in env to enable OAuth.
              </p>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}

export function AccountActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(label);
    const res = await fn();
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Done" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "connected" && (
        <Button size="sm" variant="secondary" loading={busy === "re"} onClick={() => run("re", () => reconnectAccountAction(id))}>
          Reconnect
        </Button>
      )}
      <Button size="sm" variant="ghost" loading={busy === "dis"} onClick={() => run("dis", () => disconnectAccountAction(id))}>
        Disconnect
      </Button>
    </div>
  );
}
