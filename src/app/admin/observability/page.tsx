import type { Metadata } from "next";
import { db } from "@/lib/db";
import { computeObservabilityMetrics } from "@/lib/observe";
import { parseAdminQuery } from "@/lib/admin-query";
import { eventsQueryOpts, eventsWhere } from "@/lib/admin-exports/activity";
import { ObservabilityClient } from "./observability-client";

export const metadata: Metadata = { title: "Admin · Observability & Telemetry" };

const SELECT = { id: true, level: true, source: true, message: true, createdAt: true } as const;

export default async function AdminObservabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseAdminQuery(await searchParams, eventsQueryOpts);

  // Headline metrics always describe the latest activity, whatever the list below is filtered to.
  // The list itself is filtered, sorted and paginated by the database.
  const [latest, events, total] = await Promise.all([
    db.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: SELECT }),
    db.systemEvent.findMany({ where: eventsWhere(query), orderBy: { createdAt: query.dir }, skip: query.skip, take: query.perPage, select: SELECT }),
    db.systemEvent.count({ where: eventsWhere(query) }),
  ]);

  const metrics = computeObservabilityMetrics(latest);

  return (
    <ObservabilityClient
      metrics={metrics}
      initialEvents={events.map((e) => ({ id: e.id, level: e.level, source: e.source, message: e.message, createdAt: e.createdAt.toISOString() }))}
      total={total}
      page={query.page}
      perPage={query.perPage}
    />
  );
}
