"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import { relativeTime } from "@/lib/utils";
import {
  connectAiProviderAction,
  testAiProviderAction,
  disconnectAiProviderAction,
  setDefaultAiProviderAction,
} from "@/app/actions/ai-providers";

type Provider = { id: string; label: string; apiKeyUrl: string };
type Credential = {
  id: string;
  provider: string;
  status: string;
  keyLast4: string;
  defaultModel: string | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
};

export function AiProvidersPanel({
  canManage,
  providers,
  credentials,
  defaultProvider,
}: {
  canManage: boolean;
  providers: Provider[];
  credentials: Credential[];
  defaultProvider: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [connecting, setConnecting] = React.useState<Provider | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const byProvider = new Map(credentials.map((c) => [c.provider, c]));
  const connectedCount = credentials.filter((c) => c.status === "connected").length;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Done" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
    return res.ok;
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => {
          const cred = byProvider.get(p.id);
          const isDefault = defaultProvider === p.id;
          return (
            <div key={p.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--text)]">
                  <Sparkles size={14} className="text-[var(--text-subtle)]" />
                  {p.label}
                </p>
                {cred ? (
                  <Badge tone={cred.status === "connected" ? "success" : "danger"}>
                    {cred.status === "connected" ? "Connected" : "Invalid key"}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Not connected</Badge>
                )}
              </div>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                {cred ? `Key ending ••••${cred.keyLast4}` : "GPT models and AI capabilities"}
              </p>
              {cred && (
                <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
                  {cred.lastUsedAt ? `Last used ${relativeTime(cred.lastUsedAt)}` : "Not used yet"}
                  {isDefault && " · Default"}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {cred ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canManage}
                      loading={busy === `test:${p.id}`}
                      onClick={() => run(`test:${p.id}`, () => testAiProviderAction(p.id))}
                    >
                      Test Connection
                    </Button>
                    {!isDefault && connectedCount > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManage}
                        loading={busy === `default:${p.id}`}
                        onClick={() => run(`default:${p.id}`, () => setDefaultAiProviderAction(p.id))}
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canManage}
                      loading={busy === `dis:${p.id}`}
                      onClick={async () => {
                        const confirmed = await confirmDestructive({
                          title: `Disconnect ${p.label}?`,
                          body: "AI features using this provider will stop working until another provider is connected.",
                          confirmLabel: "Disconnect",
                        });
                        if (confirmed) run(`dis:${p.id}`, () => disconnectAiProviderAction(p.id));
                      }}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={!canManage} onClick={() => setConnecting(p)}>
                    Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConnectModal key={connecting?.id ?? "none"} provider={connecting} onClose={() => setConnecting(null)} />
    </>
  );
}

function ConnectModal({ provider, onClose }: { provider: Provider | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [apiKey, setApiKey] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (!provider) return;
    setPending(true);
    const res = await connectAiProviderAction(provider.id, apiKey);
    setPending(false);
    toast({ title: res.ok ? res.message ?? "Connected" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) {
      onClose();
      router.refresh();
    }
  }

  return (
    <Modal
      open={!!provider}
      onClose={onClose}
      title={provider ? `Connect ${provider.label}` : undefined}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={pending} disabled={!apiKey.trim()} onClick={submit}>
            Connect
          </Button>
        </>
      }
    >
      {provider && (
        <div className="space-y-3">
          <Field label="API key">
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your key"
            />
          </Field>
          <p className="text-[12px] text-[var(--text-subtle)]">
            We validate the key against {provider.label} before saving it, encrypted, to this workspace. Get a key
            at{" "}
            <a href={provider.apiKeyUrl} target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:underline">
              {provider.apiKeyUrl}
            </a>
            .
          </p>
        </div>
      )}
    </Modal>
  );
}
