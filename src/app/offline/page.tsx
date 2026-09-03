import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { SystemPage } from "@/components/system-page";
import { ReloadButton } from "@/components/reload-button";

export const metadata: Metadata = { title: "You're offline" };

export default function OfflinePage() {
  return (
    <SystemPage
      code="Offline"
      icon={<WifiOff size={22} />}
      title="You're not connected to the internet"
      description="MultiPost Studio needs a connection to load your workspace. Check your Wi-Fi or mobile data, then try again. Any unsent changes are kept in this tab until you reconnect."
      actions={<ReloadButton>Retry connection</ReloadButton>}
      footer="This page will keep working offline — reload once you're back online."
    />
  );
}
