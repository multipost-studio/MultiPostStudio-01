import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Canva design creation + export, and the Return Navigation JWT check.
 * Endpoints and shapes verified against canva.dev's live docs (Create
 * design, Create/Get design export job, Return users to your platform,
 * Revoke a token) — not guessed. See lib/integrations/oauth.ts for the
 * account-connection OAuth flow this builds on.
 */
const API = "https://api.canva.com/rest/v1";

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

export type CanvaDesign = { id: string; editUrl: string };

/** Custom (not preset) size — a plain pixel canvas the user designs freely on, matching what "Design and send to the composer" needs. */
export async function createDesign(accessToken: string, width: number, height: number, title?: string): Promise<CanvaDesign> {
  const j = await json(
    await fetch(`${API}/designs`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        design_type: { type: "custom", width, height },
        ...(title ? { title } : {}),
      }),
    }),
  );
  return { id: j.design.id, editUrl: j.design.urls.edit_url };
}

/** Appends the correlation_state Canva returns to us on Return Navigation. Max 50 chars per Canva's docs — a cuid() session id fits. */
export function editUrlWithCorrelation(editUrl: string, correlationState: string): string {
  const u = new URL(editUrl);
  u.searchParams.set("correlation_state", correlationState);
  return u.toString();
}

export type ExportJob = { id: string; status: "in_progress" | "success" | "failed"; urls?: string[] };

export async function createExportJob(accessToken: string, designId: string, format: "png" | "jpg" = "png"): Promise<ExportJob> {
  const j = await json(
    await fetch(`${API}/exports`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ design_id: designId, format: { type: format } }),
    }),
  );
  return j.job;
}

export async function getExportJob(accessToken: string, exportId: string): Promise<ExportJob> {
  const j = await json(
    await fetch(`${API}/exports/${encodeURIComponent(exportId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  return j.job;
}

/** Polls a fresh export job to completion. Canva's own exports are typically single-page images and finish in a few seconds. */
export async function exportDesignAndWait(
  accessToken: string,
  designId: string,
  format: "png" | "jpg" = "png",
  maxWaitMs = 20_000,
): Promise<string> {
  let job = await createExportJob(accessToken, designId, format);
  const deadline = Date.now() + maxWaitMs;
  while (job.status === "in_progress" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    job = await getExportJob(accessToken, job.id);
  }
  if (job.status !== "success" || !job.urls?.[0]) {
    throw new Error(`Canva export did not complete: ${job.status}`);
  }
  return job.urls[0];
}

/** Export download URLs are valid for 24h and need no auth header — plain fetch. */
export async function downloadExport(url: string, maxBytes = 200 * 1024 * 1024): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Canva export download ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`Canva export too large (${ab.byteLength} bytes)`);
  return { buf: Buffer.from(ab), contentType };
}

const CANVA_JWKS = createRemoteJWKSet(new URL(`${API}/connect/keys`));

export type CorrelationClaims = { sub: string; team_id: string; design_id: string; correlation_state: string };

/**
 * Verifies the correlation_jwt Canva appends to our Return URL when the user
 * clicks "Return" in their editor. Checked against Canva's own public JWKS,
 * audience-pinned to our client ID, and type must be "rti" (return-to-
 * integration) — without this a forged redirect could claim any design_id.
 */
export async function verifyCorrelationJwt(token: string, clientId: string): Promise<CorrelationClaims | null> {
  try {
    const { payload } = await jwtVerify(token, CANVA_JWKS, { audience: clientId });
    if (payload.type !== "rti") return null;
    if (typeof payload.sub !== "string" || typeof payload.design_id !== "string" || typeof payload.correlation_state !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      team_id: typeof payload.team_id === "string" ? payload.team_id : "",
      design_id: payload.design_id,
      correlation_state: payload.correlation_state,
    };
  } catch {
    return null;
  }
}
