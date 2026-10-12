"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { isIosBrowserTab } from "@/components/pwa/install-banner";
import { pushSupport, urlBase64ToUint8Array, type PushSupport } from "@/lib/push/client";
import { removePushDeviceAction, removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/actions/push";
import { relativeTime } from "@/lib/utils";

export type PushDevice = { id: string; label: string; createdAt: string; lastSuccessAt: string | null };

const STATE_EVENT = "mps-push-state";

function readSupport(): PushSupport {
  try {
    const hasNotification = "Notification" in window;
    return pushSupport({
      hasServiceWorker: "serviceWorker" in navigator,
      hasPushManager: "PushManager" in window,
      hasNotification,
      permission: hasNotification ? Notification.permission : undefined,
      iosBrowserTab: isIosBrowserTab(navigator as unknown as { userAgent: string; maxTouchPoints?: number; standalone?: boolean }, window.matchMedia("(display-mode: standalone)").matches),
    });
  } catch {
    return "unsupported";
  }
}

function subscribeSupport(cb: () => void) {
  window.addEventListener(STATE_EVENT, cb);
  document.addEventListener("visibilitychange", cb);
  return () => {
    window.removeEventListener(STATE_EVENT, cb);
    document.removeEventListener("visibilitychange", cb);
  };
}

/** The service worker, or null if it does not become ready quickly (never leave a button spinning forever). */
async function readyWorker(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
}

/**
 * Turn browser / phone notifications on for the device in front of the person, send a test, and manage the other devices.
 * Each device subscribes itself (the browser asks permission); the person can remove any device from here at any time.
 */
export function PushDevices({ configured, publicKey, devices }: { configured: boolean; publicKey: string | null; devices: PushDevice[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const support = React.useSyncExternalStore(subscribeSupport, readSupport, () => "loading" as PushSupport);
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (support !== "granted") return;
    let live = true;
    void readyWorker()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => live && setSubscribed(!!sub))
      .catch(() => live && setSubscribed(false));
    return () => {
      live = false;
    };
  }, [support]);

  const refreshState = () => window.dispatchEvent(new Event(STATE_EVENT));
  const say = (ok: boolean, title: string, description?: string) => toast({ title, description, tone: ok ? "success" : "error" });

  async function enable() {
    if (!publicKey) return;
    setBusy("enable");
    try {
      const permission = await Notification.requestPermission();
      refreshState();
      if (permission !== "granted") {
        say(false, "Notifications weren't allowed", "You can change this in your browser's settings for this site.");
        return;
      }
      const reg = await readyWorker();
      if (!reg) {
        say(false, "Couldn't start notifications", "The app isn't ready yet. Reload the page and try again.");
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const res = await savePushSubscriptionAction(sub.toJSON());
      if (!res.ok) {
        // Don't leave a subscription the server doesn't know about.
        if (!existing) await sub.unsubscribe().catch(() => undefined);
        say(false, "Couldn't turn notifications on", res.error);
        return;
      }
      setSubscribed(true);
      say(true, res.message ?? "Notifications are on for this device.");
      router.refresh();
    } catch (err) {
      say(false, "Couldn't turn notifications on", err instanceof Error && err.name === "NotAllowedError" ? "The browser blocked the request." : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    try {
      const reg = await readyWorker();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setSubscribed(false);
      say(true, "Notifications are off for this device.");
      router.refresh();
    } catch {
      say(false, "Couldn't turn notifications off", "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    const res = await sendTestPushAction().catch(() => ({ ok: false, error: "Please try again.", message: undefined }));
    setBusy(null);
    say(res.ok, res.ok ? res.message ?? "Test sent." : "Test failed", res.ok ? undefined : res.error);
  }

  async function removeDevice(id: string) {
    setBusy(id);
    const res = await removePushDeviceAction(id).catch(() => ({ ok: false, error: "Please try again.", message: undefined }));
    setBusy(null);
    say(res.ok, res.ok ? res.message ?? "Device removed." : "Couldn't remove it", res.ok ? undefined : res.error);
    router.refresh();
  }

  let body: React.ReactNode;
  if (!configured) {
    body = <p className="text-[14px] text-[var(--text-muted)]">Browser notifications aren&apos;t available on this server yet. They need notification keys to be set up by the site administrator.</p>;
  } else if (support === "loading") {
    body = <p className="text-[14px] text-[var(--text-muted)]">Checking this device&hellip;</p>;
  } else if (support === "unsupported") {
    body = <p className="text-[14px] text-[var(--text-muted)]">This browser can&apos;t receive notifications while the app is closed. Chrome, Edge, Firefox and Safari 16.4 or newer can.</p>;
  } else if (support === "needs-install") {
    body = (
      <p className="text-[14px] text-[var(--text-muted)]">
        On iPhone and iPad, notifications work once MultiPost Studio is on your Home Screen. Tap Share, then &ldquo;Add to Home Screen&rdquo;, open the app from there, and come back to this page to turn them on.
      </p>
    );
  } else if (support === "denied") {
    body = (
      <p className="text-[14px] text-[var(--text-muted)]">
        Notifications are blocked for this site on this device. Allow them in your browser&apos;s site settings (the lock icon next to the address, or the app&apos;s settings on your phone), then reload this page.
      </p>
    );
  } else if (support === "granted" && subscribed === null) {
    body = <p className="text-[14px] text-[var(--text-muted)]">Checking this device&hellip;</p>;
  } else if (support === "granted" && subscribed) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success" dot>
          On for this device
        </Badge>
        <Button type="button" size="sm" variant="secondary" loading={busy === "test"} onClick={test}>
          <Bell size={14} className="mr-1.5" /> Send a test
        </Button>
        <Button type="button" size="sm" variant="ghost" loading={busy === "disable"} onClick={disable}>
          <BellOff size={14} className="mr-1.5" /> Turn off on this device
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" loading={busy === "enable"} onClick={enable}>
          <Bell size={14} className="mr-1.5" /> Turn on notifications on this device
        </Button>
        <span className="text-[13px] text-[var(--text-subtle)]">Your browser will ask for permission.</span>
      </div>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="text-[16px] font-semibold text-[var(--text)]">Browser &amp; phone notifications</h2>
      <p className="mt-0.5 text-[14px] text-[var(--text-muted)]">Get alerts on this device even when MultiPost Studio is closed: failed posts, approvals, mentions and more. Choose what to be told about below.</p>
      <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        {body}
        {configured && devices.length > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="text-[13px] font-medium text-[var(--text)]">Your devices ({devices.length})</p>
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2">
                  <Smartphone size={16} className="shrink-0 text-[var(--text-subtle)]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-[var(--text)]">{d.label}</p>
                    <p className="text-[12px] text-[var(--text-subtle)]" suppressHydrationWarning>
                      Added {relativeTime(new Date(d.createdAt))}
                      {d.lastSuccessAt ? ` · last delivered ${relativeTime(new Date(d.lastSuccessAt))}` : " · nothing delivered yet"}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" loading={busy === d.id} onClick={() => removeDevice(d.id)} aria-label={`Remove ${d.label}`}>
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
