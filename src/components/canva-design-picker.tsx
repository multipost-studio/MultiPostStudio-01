"use client";

import * as React from "react";
import { Palette, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createCanvaDesignAction } from "@/app/actions/canva";

const SIZES: { key: string; label: string; ratio: string }[] = [
  { key: "instagram_post", label: "Instagram post", ratio: "1080×1080" },
  { key: "instagram_story", label: "Instagram / Story", ratio: "1080×1920" },
  { key: "facebook_post", label: "Facebook post", ratio: "1200×630" },
  { key: "linkedin_post", label: "LinkedIn post", ratio: "1200×1200" },
  { key: "pinterest_pin", label: "Pinterest pin", ratio: "1000×1500" },
  { key: "x_post", label: "X post", ratio: "1600×900" },
];

/**
 * Unlike every other picker here, Canva has no "browse existing files" step
 * — you pick a canvas size, we create a blank design, and a full-page
 * navigation sends the user into Canva's own editor. They come back to this
 * app (see api/integrations/canva/return) via Canva's "Return Navigation",
 * which requires a real page redirect — it can't be done as an in-app
 * modal or iframe.
 */
export function CanvaDesignPicker({ connected, folderId }: { connected: boolean; folderId?: string | null }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function create(size: string) {
    setBusy(size);
    const res = await createCanvaDesignAction({
      size: size as (typeof SIZES)[number]["key"],
      folderId,
      returnTo: typeof window !== "undefined" ? window.location.pathname : null,
    });
    if (res.ok && res.data && typeof res.data === "object" && "editUrl" in res.data) {
      window.location.assign((res.data as { editUrl: string }).editUrl);
      return; // navigating away — no need to clear `busy`
    }
    setBusy(null);
    toast({ title: "Couldn't start a Canva design", description: res.error, tone: "error" });
  }

  if (!connected) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
          <Palette size={20} />
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text)]">Canva not connected</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Connect Canva to design graphics without leaving your workflow — pick a size, design it in Canva, and it
          comes straight back into your media library.
        </p>
        <div className="mt-4">
          <Button size="sm" asChild>
            <a href="/api/integrations/canva/start">Connect Canva in Integrations</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        Pick a size. This opens Canva in the same tab — finish your design and click{" "}
        <span className="font-medium text-[var(--text)]">Return</span> in Canva to bring it back here.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SIZES.map((s) => (
          <button
            key={s.key}
            disabled={busy !== null}
            onClick={() => create(s.key)}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-center hover:border-[var(--primary)] disabled:opacity-60"
          >
            {busy === s.key ? (
              <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
            ) : (
              <Palette size={16} className="text-[var(--text-subtle)]" />
            )}
            <span className="text-[13px] font-medium text-[var(--text)]">{s.label}</span>
            <span className="text-[11px] text-[var(--text-subtle)]">{s.ratio}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
