"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { dismissPromoCardAction } from "@/app/actions/promo-cards";
import type { PromoCardData } from "@/lib/promo-cards";
import { PromoCardView } from "./promo-card-view";
import { trackClick, useImpression } from "./promo-tracking";

/** Single banner above the dashboard widgets (placement: dashboard). */
export function DashboardPromo({ card }: { card: PromoCardData }) {
  const { toast } = useToast();
  const [hidden, setHidden] = React.useState(false);
  useImpression(hidden ? undefined : card.id);

  if (hidden) return null;

  async function dismiss() {
    setHidden(true);
    const res = await dismissPromoCardAction(card.id);
    if (!res.ok) {
      setHidden(false);
      toast({ title: res.error, tone: "error" });
    }
  }

  return <PromoCardView card={card} layout="banner" onDismiss={() => void dismiss()} onCtaClick={() => trackClick(card.id)} className="mps-animate-in" />;
}
