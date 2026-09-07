import { Check, Minus } from "lucide-react";
import { ENTITLEMENT_GROUPS } from "@/lib/constants";
import type { PlanRow } from "@/lib/plans";

/**
 * Plan feature matrix.
 *
 * Every cell is derived from the Plan table: boolean rows read the plan's
 * `entitlements` array, numeric rows read the limit columns. Nothing is
 * hardcoded per plan, so changing an entitlement in /admin/plans changes this
 * table with no code edit — which is the whole point of having one source of
 * truth for pricing.
 *
 * Numbers are shown as they actually are rather than rounded up to
 * "Unlimited": the limits are real and enforced by checkUsage(), and inventing
 * an unlimited threshold here would misrepresent them.
 */

type LimitRow = { label: string; field: keyof PlanRow; suffix?: string };

const LIMIT_ROWS: LimitRow[] = [
  { label: "Social channels", field: "maxChannels" },
  { label: "Team members", field: "maxUsers" },
  { label: "Scheduled posts", field: "maxScheduled" },
  { label: "AI credits", field: "aiCredits", suffix: "/mo" },
  { label: "Media storage", field: "storageMb", suffix: " MB" },
  { label: "Analytics retention", field: "analyticsRetentionDays", suffix: " days" },
  { label: "API requests", field: "apiRateLimit", suffix: "/min" },
  { label: "Automations", field: "automationLimit" },
];

function limitValue(plan: PlanRow, row: LimitRow): string {
  if (plan.isCustom) return "Custom";
  const raw = plan[row.field];
  const n = typeof raw === "number" ? raw : 0;
  if (n <= 0) return "—";
  return `${n.toLocaleString("en-US")}${row.suffix ?? ""}`;
}

function Cell({ on }: { on: boolean }) {
  return on ? (
    <Check size={15} className="mx-auto text-[var(--success)]" aria-hidden />
  ) : (
    <Minus size={15} className="mx-auto text-[var(--text-subtle)]" aria-hidden />
  );
}

export function FeatureComparison({ plans }: { plans: PlanRow[] }) {
  if (plans.length === 0) return null;
  const ents = plans.map((p) => new Set(p.entitlements));

  return (
    /* Scrolls horizontally on narrow screens; the page itself never overflows. */
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <caption className="sr-only">
          Feature and limit comparison across MultiPost Studio plans
        </caption>
        <thead>
          {/* Sticky so plan names stay visible while scrolling a long matrix. */}
          <tr className="sticky top-0 z-10 bg-[var(--bg)]">
            <th scope="col" className="w-[38%] py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              Feature
            </th>
            {plans.map((p) => (
              <th
                key={p.key}
                scope="col"
                className="border-b border-[var(--border)] px-2 py-3 text-center text-[14px] font-semibold text-[var(--text)]"
              >
                {p.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr>
            <th
              scope="colgroup"
              colSpan={plans.length + 1}
              className="bg-[var(--bg-sunken)] px-3 py-2 text-left text-[13px] font-semibold text-[var(--text)]"
            >
              Limits
            </th>
          </tr>
          {LIMIT_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
              <th scope="row" className="py-2.5 pr-3 text-left font-normal text-[var(--text-muted)]">
                {row.label}
              </th>
              {plans.map((p) => (
                <td key={p.key} className="px-2 py-2.5 text-center tabular-nums text-[var(--text)]">
                  {limitValue(p, row)}
                </td>
              ))}
            </tr>
          ))}

          {ENTITLEMENT_GROUPS.map((group) => (
            <FeatureGroup key={group.group} group={group} plans={plans} ents={ents} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureGroup({
  group,
  plans,
  ents,
}: {
  group: (typeof ENTITLEMENT_GROUPS)[number];
  plans: PlanRow[];
  ents: Set<string>[];
}) {
  // Hide a whole category no plan grants — an all-dashes block tells the
  // reader nothing and just makes the table longer.
  const rows = group.items.filter(([key]) => ents.some((e) => e.has(key)));
  if (rows.length === 0) return null;

  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={plans.length + 1}
          className="bg-[var(--bg-sunken)] px-3 py-2 text-left text-[13px] font-semibold text-[var(--text)]"
        >
          {group.group}
        </th>
      </tr>
      {rows.map(([key, label]) => (
        <tr key={key} className="border-b border-[var(--border)] last:border-0">
          <th scope="row" className="py-2.5 pr-3 text-left font-normal text-[var(--text-muted)]">
            {label}
          </th>
          {plans.map((p, i) => (
            <td key={p.key} className="px-2 py-2.5 text-center">
              {/* Screen readers get words; sighted users get the icon. */}
              <span className="sr-only">{ents[i].has(key) ? "Included" : "Not included"}</span>
              <Cell on={ents[i].has(key)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
