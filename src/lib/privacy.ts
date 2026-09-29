import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";

export const PRIVACY_REQUEST_TYPES = ["access", "correction", "erasure", "consent_withdrawal", "complaint"] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

/** Files a tracked, timestamped rights request. Never performs the underlying action — see the PrivacyRequest schema comment. */
export async function filePrivacyRequest(input: { userId: string; orgId?: string | null; type: PrivacyRequestType; details?: string }) {
  const request = await db.privacyRequest.create({
    data: { userId: input.userId, orgId: input.orgId ?? null, type: input.type, details: input.details?.trim() || null },
  });
  await logAudit({
    orgId: input.orgId ?? null,
    actorId: input.userId,
    action: "PRIVACY_REQUEST_FILED",
    targetType: "privacyRequest",
    targetId: request.id,
    metadata: { type: input.type },
  });
  return request;
}
