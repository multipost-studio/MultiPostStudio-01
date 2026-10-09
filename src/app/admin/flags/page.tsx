import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { parseAdminQuery } from "@/lib/admin-query";
import { flagsQueryOpts, flagsWhere } from "@/lib/admin-exports/platform";
import { FlagToggle } from "../admin-client";
import { AdminToolbar } from "../_controls";
import { FlagsImport } from "./flags-import";

export const metadata: Metadata = { title: "Admin · Feature flags" };

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("flags.view");
  const raw = await searchParams;
  const query = parseAdminQuery(raw, flagsQueryOpts);
  const [flags, total] = await Promise.all([
    db.featureFlag.findMany({ where: flagsWhere(query), orderBy: { key: "asc" } }),
    db.featureFlag.count(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Feature flags</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          {flags.length === total ? `${total} flags` : `${flags.length} of ${total} flags`}. Export a list, edit it, and import it back to copy flags between environments.
        </p>
      </div>
      <AdminToolbar
        searchPlaceholder="Search flag key or description…"
        exportType="flags"
        pagination={false}
        filters={[{ key: "state", label: "State", options: [{ value: "on", label: "enabled" }, { value: "off", label: "disabled" }] }]}
      >
        <FlagsImport />
      </AdminToolbar>
      <Table>
        <THead>
          <TR>
            <TH>Flag</TH>
            <TH>Description</TH>
            <TH>State</TH>
          </TR>
        </THead>
        <tbody>
          {flags.length === 0 ? (
            <TR>
              <TD colSpan={3} className="py-8 text-center text-[var(--text-muted)]">No flags match.</TD>
            </TR>
          ) : (
            flags.map((f) => (
              <TR key={f.id}>
                <TD className="font-mono text-[13px]">{f.key}</TD>
                <TD className="text-[var(--text-muted)]">{f.description}</TD>
                <TD>
                  <FlagToggle id={f.id} enabled={f.enabled} rollout={f.rollout} />
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
