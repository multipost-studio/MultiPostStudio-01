import type { Metadata } from "next";
import { db } from "@/lib/db";
import { computeObservabilityMetrics } from "@/lib/observe";
import { ObservabilityClient } from "./observability-client";

export const metadata: Metadata = { title: "Admin · Observability & Telemetry" };

export default async function AdminObservabilityPage() {
  const events = await db.systemEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      level: true,
      source: true,
      message: true,
      createdAt: true,
    },
  });

  const metrics = computeObservabilityMetrics(events);

  const formattedEvents = events.map((e) => ({
    id: e.id,
    level: e.level,
    source: e.source,
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <ObservabilityClient
      metrics={metrics}
      initialEvents={formattedEvents}
    />
  );
}
