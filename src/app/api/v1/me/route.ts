import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";

export const runtime = "nodejs";

/** GET /api/v1/me — identify the key + its org. No scope required. */
export const GET = apiRoute(undefined, async (_req, ctx) => {
  const org = await db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { id: true, name: true, slug: true, type: true },
  });
  return apiOk({
    key: { id: ctx.keyId, name: ctx.name, scopes: ctx.scopes },
    org,
  });
});
