"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Check, ChevronDown, Plug, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createApiKeyAction } from "@/app/actions/integrations";
import { revokeAiAppAction } from "@/app/actions/mcp-oauth";
import { READ_ONLY_SCOPES } from "@/lib/mcp/scopes";

export type ConnectedApp = { id: string; name: string; by: string; where: string; scopes: string[]; connected: string; lastUsed: string | null };
export type ActivityRow = { id: string; text: string; when: string };

type Assistant = {
  id: string;
  name: string;
  blurb: string;
  /** How it signs in: the sign-in screen (no key to copy), or a key pasted into its settings. */
  mode: "oauth" | "key";
  steps: string[];
  /** A ready-to-paste block that carries the server address and the key. */
  snippet?: (url: string, key: string) => { label: string; text: string };
};

const KEY_HOLDER = "YOUR_API_KEY";

const ASSISTANTS: Assistant[] = [
  {
    id: "claude",
    name: "Claude",
    blurb: "Claude on the web, desktop and mobile",
    mode: "oauth",
    steps: [
      "In Claude, open Customize, then Connectors.",
      "Choose Add custom connector and paste the server address above.",
      "Click Connect. You'll sign in here and choose what Claude may do.",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    blurb: "ChatGPT connectors",
    mode: "oauth",
    steps: [
      "In ChatGPT, open Settings, then Connectors, and add a custom connector (developer mode may need to be on).",
      "Paste the server address above and choose OAuth for sign-in.",
      "Approve the connection when you're sent here.",
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    blurb: "Claude in your terminal",
    mode: "key",
    steps: ["Create a key below, then run the command.", "Or run the command without the header and use /mcp inside Claude Code to sign in instead."],
    snippet: (url, key) => ({ label: "Terminal", text: `claude mcp add --transport http multipost-studio ${url} --header "Authorization: Bearer ${key}"` }),
  },
  {
    id: "cursor",
    name: "Cursor",
    blurb: "The Cursor editor",
    mode: "key",
    steps: ["Create a key below.", "Add this to .cursor/mcp.json (or Cursor's MCP settings)."],
    snippet: (url, key) => ({ label: ".cursor/mcp.json", text: JSON.stringify({ mcpServers: { "multipost-studio": { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2) }),
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    blurb: "Google's Gemini in your terminal",
    mode: "key",
    steps: ["Create a key below.", "Add this to Gemini CLI's settings.json."],
    snippet: (url, key) => ({ label: "settings.json", text: JSON.stringify({ mcpServers: { "multipost-studio": { httpUrl: url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2) }),
  },
  {
    id: "other",
    name: "Any other AI tool",
    blurb: "Perplexity, Raycast, Windsurf and more",
    mode: "key",
    steps: ["Look for MCP or custom connector in the tool's settings.", "Use the server address above. If it asks for a header, create a key below and send Authorization: Bearer <key>."],
    snippet: (url, key) => ({ label: "Server and header", text: `Server URL: ${url}\nHeader:     Authorization: Bearer ${key}` }),
  },
];

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [done, setDone] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast({ title: "Couldn't copy", description: "Select the text and copy it by hand.", tone: "error" });
        }
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </Button>
  );
}

/** Ask our own endpoint, with this key, what it can do: a real check that the key and the server work together. */
async function testConnection(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${key}` },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "connection-test", version: "1" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: body?.error?.message ?? `The server answered ${res.status}.` };
    const tools = Array.isArray(body) ? body.find((r: { id?: number }) => r.id === 2)?.result?.tools : null;
    if (!Array.isArray(tools)) return { ok: false, message: "The server answered, but not with a tool list." };
    return { ok: true, message: `Works. This key can use ${tools.length} tool${tools.length === 1 ? "" : "s"}.` };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection." };
  }
}

function KeySetup({ assistant, serverUrl, canManage }: { assistant: Assistant; serverUrl: string; canManage: boolean }) {
  const { toast } = useToast();
  const [allowChanges, setAllowChanges] = React.useState(false);
  const [key, setKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [test, setTest] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = React.useState(false);

  async function create() {
    setBusy(true);
    const fd = new FormData();
    fd.set("name", `${assistant.name} (AI assistant)`);
    [...READ_ONLY_SCOPES, ...(allowChanges ? (["posts:write", "ideas:write"] as const) : [])].forEach((s) => fd.append("scopes", s));
    try {
      const res = await createApiKeyAction(null, fd);
      if (res.ok && res.data && typeof res.data === "object" && "raw" in res.data) setKey((res.data as { raw: string }).raw);
      else toast({ title: "Couldn't create the key", description: res.error, tone: "error" });
    } catch {
      toast({ title: "Couldn't create the key", description: "Try again in a moment.", tone: "error" });
    }
    setBusy(false);
  }

  const shown = assistant.snippet?.(serverUrl, key ?? KEY_HOLDER);
  return (
    <div className="mt-3 space-y-3">
      {canManage ? (
        key ? (
          <p className="text-[13px] text-[var(--text-muted)]">
            Your key is in the block below. <span className="font-medium text-[var(--text)]">Copy it now: it won&apos;t be shown again.</span> It can only{" "}
            {allowChanges ? "read, and save drafts, schedule posts and add ideas" : "read"}.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <input type="checkbox" checked={allowChanges} onChange={(e) => setAllowChanges(e.target.checked)} />
              Also let it save drafts, schedule posts and add ideas
            </label>
            <Button size="sm" loading={busy} onClick={create}>
              Create {allowChanges ? "a key" : "a read-only key"}
            </Button>
          </div>
        )
      ) : (
        <p className="text-[13px] text-[var(--text-subtle)]">Ask an owner or admin to create the key.</p>
      )}

      {shown && (
        <div className="rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[var(--text-subtle)]">{shown.label}</span>
            <CopyButton text={shown.text} />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[12.5px] text-[var(--text)]">{shown.text}</pre>
        </div>
      )}

      {key && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={testing}
            onClick={async () => {
              setTesting(true);
              setTest(await testConnection(key));
              setTesting(false);
            }}
          >
            Test connection
          </Button>
          {test && (
            <span role="status" className={`text-[13px] ${test.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              {test.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AiAssistants({ serverUrl, openApiUrl, canManage, apps, activity }: { serverUrl: string; openApiUrl: string; canManage: boolean; apps: ConnectedApp[]; activity: ActivityRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section aria-label="Server address" className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--text)]">Your MCP server address</p>
            <code className="mt-1 block break-all font-mono text-[13px] text-[var(--text)]">{serverUrl}</code>
          </div>
          <CopyButton text={serverUrl} label="Copy address" />
        </div>
        <p className="mt-2 text-[12.5px] text-[var(--text-subtle)]">
          MCP is the open standard AI tools use to connect to apps. Assistants can read your channels, posts and analytics and save drafts or schedule posts. They can never publish
          immediately or reply to people.
        </p>
      </section>

      <section aria-label="Choose your AI tool">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Choose your AI tool</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSISTANTS.map((a) => {
            const isOpen = open === a.id;
            return (
              <div key={a.id} className={`rounded-[var(--radius-lg)] border bg-[var(--surface)] p-4 ${isOpen ? "border-[var(--primary)] sm:col-span-2 lg:col-span-3" : "border-[var(--border)]"}`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Sparkles size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-[var(--text)]">{a.name}</span>
                      <Badge tone="neutral">{a.mode === "oauth" ? "Sign in" : "API key"}</Badge>
                    </span>
                    <span className="block text-[13px] text-[var(--text-muted)]">{a.blurb}</span>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" className={`mt-1 shrink-0 text-[var(--text-subtle)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <ol className="list-decimal space-y-1 pl-5 text-[13.5px] text-[var(--text-muted)]">
                      {a.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                    {a.mode === "key" && <KeySetup assistant={a} serverUrl={serverUrl} canManage={canManage} />}
                    <p className="mt-3 text-[12px] text-[var(--text-subtle)]">Menus change between versions. If a name differs, look for &ldquo;MCP&rdquo; or &ldquo;custom connector&rdquo;.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-[var(--text-muted)]">
          No MCP in your tool? Import our{" "}
          <a href={openApiUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--primary)] hover:underline">
            OpenAPI description
          </a>{" "}
          (ChatGPT custom GPT actions, Postman, code generators) or use{" "}
          <Link href="/settings/api" className="font-medium text-[var(--primary)] hover:underline">
            API keys and webhooks
          </Link>{" "}
          with Zapier, Make or n8n.
        </p>
      </section>

      <section aria-label="Connected assistants">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Connected through sign-in</h2>
        {apps.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-4 text-[13.5px] text-[var(--text-muted)]">
            <Plug size={14} className="mr-1.5 inline align-[-2px]" aria-hidden="true" />
            Nothing connected yet. Assistants you connect with the sign-in screen appear here, and you can disconnect them any time. Keys are listed in{" "}
            <Link href="/settings/api" className="font-medium text-[var(--primary)] hover:underline">
              Settings, API keys
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {apps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[var(--text)]">{a.name}</p>
                  <p className="text-[12.5px] text-[var(--text-muted)]">
                    {a.where} · connected by {a.by} {a.connected}
                    {a.lastUsed ? ` · last used ${a.lastUsed}` : " · not used yet"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">{a.scopes.join(", ")}</p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await revokeAiAppAction(a.id);
                      toast({ title: res.ok ? `${a.name} disconnected` : "Couldn't disconnect", description: res.error, tone: res.ok ? "success" : "error" });
                      if (res.ok) router.refresh();
                    }}
                  >
                    Disconnect
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Recent activity">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">What assistants did lately</h2>
        {activity.length === 0 ? (
          <p className="text-[13.5px] text-[var(--text-muted)]">Nothing yet. Changes an assistant makes (drafts, scheduled posts, edits, deletes) are listed here.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
            {activity.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate text-[var(--text)]">{r.text}</span>
                <span className="shrink-0 text-[12px] text-[var(--text-subtle)]" suppressHydrationWarning>
                  {r.when}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
