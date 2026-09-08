"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from "@/lib/constants";
import { PlatformBadge } from "@/components/brand";
import { canPublishPlatform, contentTypesFor, supportsFirstComment } from "@/lib/social/capabilities";
import {
  connectAccountAction,
  connectBlueskyAction,
  reconnectAccountAction,
  disconnectAccountAction,
} from "@/app/actions/integrations";
import { disconnectIntegrationAction } from "@/app/actions/drive";

/**
 * What kind of account each platform connects. Factual descriptors of the
 * account type, shown under the platform name in the picker.
 */
const ACCOUNT_TYPE: Record<string, string> = {
  instagram: "Business or Creator account",
  facebook: "Page",
  linkedin: "Profile",
  x: "Profile",
  tiktok: "Profile",
  youtube: "Channel",
  pinterest: "Business account",
  threads: "Profile",
  gbp: "Business Profile",
  bluesky: "Profile",
};

type ConnectMode = "oauth" | "bluesky" | "stub";

function connectMode(platform: string, providers: Record<string, boolean>): ConnectMode {
  return platform === "bluesky" ? "bluesky" : providers[platform] ? "oauth" : "stub";
}

/**
 * Everything the detail step says about a platform is derived from the
 * capability table and the configured providers — never hand-written per
 * platform. A marketing blurb would drift from what the publisher does; these
 * chips change automatically when a capability does.
 */
function featureChips(platform: string): string[] {
  const chips = contentTypesFor(platform)
    .filter((t) => t.publish === "api")
    .map((t) => t.label);
  if (supportsFirstComment(platform)) chips.push("First comment");
  return chips;
}

/** One tile in the platform grid. */
function PlatformTile({
  platform,
  providers,
  onSelect,
}: {
  platform: PlatformKey;
  providers: Record<string, boolean>;
  onSelect: () => void;
}) {
  const publishes = canPublishPlatform(platform);
  const mode = connectMode(platform, providers);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-center transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
    >
      <PlatformBadge platform={platform} size={34} />
      <span className="text-[14px] font-semibold text-[var(--text)]">{PLATFORMS[platform].label}</span>
      <span className="text-[12px] leading-tight text-[var(--text-subtle)]">
        {ACCOUNT_TYPE[platform] ?? "Account"}
      </span>
      {!publishes ? (
        <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--warning)]">
          No publishing
        </span>
      ) : mode === "stub" ? (
        <span className="rounded-full bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">
          Demo
        </span>
      ) : null}
    </button>
  );
}

export function ConnectAccount({ providers }: { providers: Record<string, boolean> }) {
  const [open, setOpen] = React.useState(false);
  // null = the platform picker; a key = that platform's detail step.
  const [platform, setPlatform] = React.useState<PlatformKey | null>(null);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  function close() {
    setOpen(false);
    // Reset to the picker so reopening never lands mid-flow on a stale choice.
    setPlatform(null);
  }

  const mode = platform ? connectMode(platform, providers) : null;
  // Real OAuth does not imply we can post. Google Business authorizes fine and
  // then cannot publish at all, so the dialog must not call it simply "real".
  const publishes = platform ? canPublishPlatform(platform) : false;
  const label = platform ? PLATFORMS[platform].label : "";

  async function submit(fd: FormData, action: typeof connectAccountAction) {
    setPending(true);
    const res = await action(null, fd);
    setPending(false);
    toast({
      title: res.ok ? res.message ?? "Connected" : "Failed",
      description: res.error,
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) {
      close();
      router.refresh();
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plug size={15} /> Connect account
      </Button>
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title={platform ? undefined : "Connect a new channel"}
        description={
          platform
            ? undefined
            : "Pick a platform. Where its app credentials are configured you'll authorize with the platform itself."
        }
        footer={
          platform ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setPlatform(null)}>
                Back
              </Button>
              {mode === "oauth" ? (
                <Button size="sm" asChild>
                  <a href={`/api/oauth/${platform}/start`}>Connect {label}</a>
                </Button>
              ) : (
                <Button size="sm" type="submit" form="connect" loading={pending}>
                  {mode === "bluesky" ? "Connect Bluesky" : `Connect ${label} (demo)`}
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          )
        }
      >
        {/* Step 1 — pick a platform. */}
        {!platform && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PLATFORM_KEYS.map((p) => (
              <PlatformTile key={p} platform={p} providers={providers} onSelect={() => setPlatform(p)} />
            ))}
          </div>
        )}

        {/* Step 2 — what connecting this platform actually gets you. */}
        {platform && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlatform(null)}
                aria-label="Back to all platforms"
                className="rounded-[var(--radius)] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <ArrowLeft size={16} />
              </button>
              <PlatformBadge platform={platform} size={30} />
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-[var(--text)]">{label}</p>
                <p className="text-[13px] text-[var(--text-subtle)]">{ACCOUNT_TYPE[platform] ?? "Account"}</p>
              </div>
            </div>

            {publishes && featureChips(platform).length > 0 && (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                  What you can publish
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {featureChips(platform).map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[12px] text-[var(--text-muted)]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!publishes && (
              <p className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[13px] text-[var(--text)]">
                You can connect {label} and read its profile, but publishing to it isn&apos;t available
                yet — scheduled posts to this account will fail. Connect it only if you want the account
                on file.
              </p>
            )}

            {mode === "oauth" && publishes && (
              <p className="text-[13px] text-[var(--text-muted)]">
                You&apos;ll be sent to {label} to authorize MultiPost Studio, then back here.
              </p>
            )}

            {mode === "bluesky" && (
              <form
                id="connect"
                className="space-y-3"
                action={(fd) => submit(fd, connectBlueskyAction)}
              >
                <Field label="Handle">
                  <Input name="identifier" required placeholder="you.bsky.social" />
                </Field>
                <Field label="App password">
                  <Input name="appPassword" type="password" required placeholder="xxxx-xxxx-xxxx-xxxx" />
                </Field>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  Create one at bsky.app &rarr; Settings &rarr; App Passwords. Not your main password.
                </p>
              </form>
            )}

            {mode === "stub" && (
              <form id="connect" className="space-y-3" action={(fd) => submit(fd, connectAccountAction)}>
                <input type="hidden" name="platform" value={platform} />
                <Field label="Account handle">
                  <Input name="handle" required placeholder="@yourbrand" />
                </Field>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  No OAuth app is configured for {label}, so this creates a placeholder connection that
                  cannot publish. Add its credentials to enable real authorization.
                </p>
              </form>
            )}
          </div>
        )}
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

/** Card for a ConnectedIntegration-backed source (Google Drive, ...). */
export function IntegrationCard({
  provider,
  label,
  desc,
  cat,
  connected,
  connectedAs,
}: {
  provider: string;
  label: string;
  desc: string;
  cat: string;
  connected: { id: string; accountEmail: string | null } | null;
  connectedAs: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-[var(--text)]">{label}</p>
        <Badge tone={connected ? "success" : "neutral"}>{connected ? "Connected" : cat}</Badge>
      </div>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        {connected ? (connectedAs ?? "Connected") : desc}
      </p>
      <div className="mt-3">
        {connected ? (
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const res = await disconnectIntegrationAction(connected.id);
              setBusy(false);
              toast({ title: res.ok ? "Disconnected" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
              if (res.ok) router.refresh();
            }}
          >
            Disconnect
          </Button>
        ) : (
          <a href={`/api/integrations/${provider}/start`}>
            <Button size="sm">Connect</Button>
          </a>
        )}
      </div>
    </div>
  );
}
