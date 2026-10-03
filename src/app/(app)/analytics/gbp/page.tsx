import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { InlineEmpty } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { GbpAnalyticsDashboard } from "./gbp-analytics-client";

export const metadata: Metadata = { title: "Google Business Profile Analytics" };

export default async function GbpAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; location?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { account: accountParam, location: locationParam } = await searchParams;

  const accounts = await db.socialAccount.findMany({
    where: {
      workspaceId: ctx.active.workspace.id,
      platform: "gbp",
      status: "connected",
    },
    include: {
      channels: {
        where: { workspaceId: ctx.active.workspace.id },
        select: { id: true, name: true, handle: true, metadata: true },
      },
    },
    orderBy: { connectedAt: "asc" },
  });

  const selectedAccount =
    accounts.find((a) => a.id === accountParam) ?? accounts[0] ?? null;

  // Compile available locations across connected accounts/channels
  const locationsList: Array<{
    accountId: string;
    accountLabel: string;
    locationId: string;
    locationName: string;
  }> = [];

  for (const acct of accounts) {
    const acctLabel = acct.displayName || acct.handle;
    if (acct.channels.length > 0) {
      for (const ch of acct.channels) {
        locationsList.push({
          accountId: acct.id,
          accountLabel: acctLabel,
          locationId: ch.handle,
          locationName: ch.name,
        });
      }
    } else {
      // Check account.metadata for discovered locations if no channels created yet
      try {
        const meta = acct.metadata ? JSON.parse(acct.metadata) : {};
        const discovered = (meta.locations as Array<{ name: string; title: string }>) ?? [];
        for (const loc of discovered) {
          locationsList.push({
            accountId: acct.id,
            accountLabel: acctLabel,
            locationId: loc.name,
            locationName: loc.title,
          });
        }
      } catch {}
    }
  }

  const selectedLocation =
    locationsList.find((l) => l.locationId === locationParam) ??
    (selectedAccount
      ? locationsList.find((l) => l.accountId === selectedAccount.id) ?? locationsList[0]
      : locationsList[0]) ??
    null;

  return (
    <>
      <PageHeader
        title="Google Business Profile Analytics"
        description="Search & Maps impressions, website clicks, call clicks, direction requests, bookings, and top search keywords — powered by the Google Business Profile Performance API."
        actions={
          <Link href="/integrations">
            <Button variant="secondary" size="sm">
              Manage Locations
            </Button>
          </Link>
        }
      />

      {locationsList.length > 0 && selectedLocation ? (
        <GbpAnalyticsDashboard
          accounts={accounts.map((a) => ({
            id: a.id,
            label: a.displayName || a.handle,
          }))}
          locations={locationsList}
          initialAccountId={selectedLocation.accountId}
          initialLocationId={selectedLocation.locationId}
        />
      ) : (
        <InlineEmpty
          title="No Google Business Profile locations connected"
          hint="Connect your Google Business Profile and select at least one location in Integrations to view its performance analytics."
          action={
            <Link href="/integrations">
              <Button size="sm">Go to Integrations</Button>
            </Link>
          }
        />
      )}
    </>
  );
}
