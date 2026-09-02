import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { FlagToggle } from "../admin-client";

export const metadata: Metadata = { title: "Admin · Feature flags" };

export default async function AdminFlagsPage() {
  const flags = await db.featureFlag.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Feature flags</h1>
      <Table>
        <THead>
          <TR>
            <TH>Flag</TH>
            <TH>Description</TH>
            <TH>State</TH>
          </TR>
        </THead>
        <tbody>
          {flags.map((f) => (
            <TR key={f.id}>
              <TD className="font-mono text-[13px]">{f.key}</TD>
              <TD className="text-[var(--text-muted)]">{f.description}</TD>
              <TD>
                <FlagToggle id={f.id} enabled={f.enabled} rollout={f.rollout} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
