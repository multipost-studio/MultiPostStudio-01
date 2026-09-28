"use client";

import * as React from "react";
import { Loader2, ImagePlus, AlertCircle, Film, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  startPhotosSessionAction,
  pollPhotosSessionAction,
  listPhotosSessionItemsAction,
  photosThumbnailAction,
  importPhotosSessionAction,
} from "@/app/actions/google-photos";

type Session = { id: string; pickerUri: string; mediaItemsSet: boolean; pollIntervalMs: number };
type Item = { id: string; filename: string; mimeType: string; baseUrl: string; isVideo: boolean };

/**
 * Google Photos, via the Photos Picker API — a fundamentally different shape
 * from every other picker here. Google's picker isn't an embeddable widget
 * (like Drive's) or a plain file list (like Dropbox/OneDrive): the user
 * picks in a Google-hosted tab, and this component polls until that's done,
 * then lists exactly what they chose. No re-selection step on our side —
 * they already chose in Google's own UI.
 */
export function GooglePhotosPicker({
  connected,
  folderId,
  onImported,
}: {
  connected: boolean;
  folderId?: string | null;
  onImported: (assetId: string) => void;
}) {
  const { toast } = useToast();
  const [session, setSession] = React.useState<Session | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [thumbs, setThumbs] = React.useState<Record<string, string | null>>({});
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!session || session.mediaItemsSet) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const res = await pollPhotosSessionAction(session.id);
      if (cancelled) return;
      if (res.ok && res.data) {
        const s = res.data as Session;
        if (s.mediaItemsSet) {
          clearInterval(timer);
          setSession(s);
        }
      }
    }, session.pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session]);

  React.useEffect(() => {
    if (!session?.mediaItemsSet || items) return;
    let cancelled = false;
    (async () => {
      const res = await listPhotosSessionItemsAction(session.id);
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data)) {
        setItems(res.data as Item[]);
        for (const item of res.data as Item[]) {
          photosThumbnailAction(item).then((r) => {
            if (!cancelled && r.ok) setThumbs((prev) => ({ ...prev, [item.id]: (r.data as string | null) ?? null }));
          });
        }
      } else {
        setError(res.error ?? "Couldn't load your selection");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, items]);

  async function start() {
    setStarting(true);
    setError(null);
    const res = await startPhotosSessionAction();
    setStarting(false);
    if (res.ok && res.data) {
      const s = res.data as Session;
      setSession(s);
      setItems(null);
      window.open(s.pickerUri, "_blank", "noopener,noreferrer");
    } else {
      toast({ title: "Couldn't open Google Photos", description: res.error, tone: "error" });
    }
  }

  async function doImport() {
    if (!session || !items || items.length === 0) return;
    setImporting(true);
    const res = await importPhotosSessionAction({ sessionId: session.id, items, folderId });
    setImporting(false);
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      toast({ title: res.message ?? `${res.data.length} file(s) imported`, tone: "success" });
      onImported(res.data[0]);
      setSession(null);
      setItems(null);
    } else {
      toast({ title: "Import failed", description: res.error, tone: "error" });
    }
  }

  if (!connected) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
          <ImagePlus size={20} />
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text)]">Google Photos not connected</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Connect Google Photos to import pictures and videos into your media library or composer.
        </p>
        <div className="mt-4">
          <Button size="sm" asChild>
            <a href="/api/integrations/google_photos/start">Connect Google Photos in Integrations</a>
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-center">
        <AlertCircle size={18} className="mx-auto mb-2 text-[var(--danger)]" />
        <p className="text-[13.5px] text-[var(--text)]">{error}</p>
      </div>
    );
  }

  // Waiting on the Google-hosted tab.
  if (session && !session.mediaItemsSet) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <Loader2 size={20} className="mx-auto mb-3 animate-spin text-[var(--primary)]" />
        <h3 className="text-[15px] font-semibold text-[var(--text)]">Waiting for your selection…</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Choose photos or videos in the Google Photos tab that just opened, then come back here.
        </p>
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => window.open(session.pickerUri, "_blank", "noopener,noreferrer")}>
          <ExternalLink size={13} /> Reopen that tab
        </Button>
      </div>
    );
  }

  // Selection made, loading what they picked.
  if (session?.mediaItemsSet && !items) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-muted)]">
        <Loader2 size={18} className="animate-spin text-[var(--primary)]" />
        <p className="text-[13px]">Loading your selection…</p>
      </div>
    );
  }

  // Ready to import.
  if (session?.mediaItemsSet && items) {
    return (
      <div>
        <div className="max-h-[380px] grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {items.map((it) => (
            <div key={it.id} className="aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]">
              {thumbs[it.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[it.id]!} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--text-subtle)]">
                  {it.isVideo ? <Film size={18} /> : <ImageIcon size={18} />}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
          <Button size="sm" variant="ghost" onClick={() => { setSession(null); setItems(null); }}>
            Choose again
          </Button>
          <Button size="sm" loading={importing} onClick={doImport}>
            Import {items.length} file{items.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    );
  }

  // Idle, connected, no session yet.
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--primary)]">
        <ImagePlus size={24} />
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--text)]">Import from Google Photos</h3>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-muted)]">
        Opens Google Photos in a new tab. Pick what you want, then come back — only the items you select are shared
        with MultiPost Studio.
      </p>
      <div className="mt-5 flex justify-center">
        <Button size="md" onClick={start} disabled={starting} loading={starting}>
          {starting ? "Opening…" : "Browse Google Photos"}
        </Button>
      </div>
    </div>
  );
}
