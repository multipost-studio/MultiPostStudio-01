import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/session";
import { grantTargets } from "@/lib/mcp/consent";
import { isKnownClientUri, redirectHost } from "@/lib/mcp/oauth";
import { ASSISTANT_SCOPES, READ_ONLY_SCOPES, SCOPE_INFO } from "@/lib/mcp/scopes";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect an AI assistant", robots: { index: false } };
export const dynamic = "force-dynamic";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[18px] font-semibold text-[var(--text)]">{title}</h1>
      <p className="mt-2 text-[14px] text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request } = await searchParams;
  const id = typeof request === "string" && request.length <= 100 ? request : "";
  if (!id) return <Notice title="Nothing to approve">Open this page from the AI assistant you want to connect.</Notice>;

  // Signing in comes back to this exact page: the request id is all the address carries.
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/connect/authorize?request=${id}`)}`);

  const row = await db.oAuthAuthRequest.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!row || row.expiresAt <= new Date() || row.codeHash || row.usedAt) {
    return <Notice title="This request has expired">Go back to the AI assistant and start the connection again.</Notice>;
  }

  const targets = grantTargets(ctx.workspaces);
  if (targets.length === 0) {
    return (
      <Notice title="You can't connect an assistant here">
        Connecting an AI assistant needs an owner or admin role. Ask an owner or admin of your workspace to connect it, or sign in with a different account.
      </Notice>
    );
  }

  let requested: string[] = [];
  try {
    const parsed = JSON.parse(row.scopes);
    if (Array.isArray(parsed)) requested = parsed.map(String);
  } catch {
    /* none requested */
  }
  const allowed = new Set<string>(ASSISTANT_SCOPES);
  const preselected = requested.filter((s) => allowed.has(s));

  return (
    <ConsentForm
      requestId={row.id}
      clientName={row.client.name}
      returnHost={redirectHost(row.redirectUri)}
      knownApp={isKnownClientUri(row.redirectUri)}
      email={ctx.user.email}
      targets={targets.map((t) => ({ value: t.value, label: t.label }))}
      scopes={ASSISTANT_SCOPES.map((s) => ({ key: s, ...SCOPE_INFO[s] }))}
      initialScopes={preselected.length > 0 ? preselected : READ_ONLY_SCOPES}
    />
  );
}
