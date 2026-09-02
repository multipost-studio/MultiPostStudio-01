import type { Metadata } from "next";
import { db } from "@/lib/db";
import { parseJson, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanEditor } from "../admin-client";

export const metadata: Metadata = { title: "Admin · Plans" };

export default async function AdminPlansPage() {
  const plans = await db.plan.findMany({ orderBy: { sortIndex: "asc" }, include: { _count: { select: { subscriptions: true } } } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">Plans</h1>
      <div className="space-y-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>
                {p.name}{" "}
                <span className="text-[13px] font-normal text-[var(--text-subtle)]">
                  {formatCurrency(p.priceMonthly)}/mo · {p._count.subscriptions} subscribers
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5 text-[12px] text-[var(--text-muted)]">
                {parseJson<string[]>(p.features, []).map((f) => (
                  <span key={f} className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5">{f}</span>
                ))}
              </div>
              <PlanEditor
                id={p.id}
                priceMonthly={p.priceMonthly}
                maxChannels={p.maxChannels}
                maxUsers={p.maxUsers}
                aiCredits={p.aiCredits}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
