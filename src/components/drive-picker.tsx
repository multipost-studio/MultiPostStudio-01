"use client";

import * as React from "react";
import { Loader2, HardDrive, ShieldCheck, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  getDrivePickerConfigAction,
  importDriveFilesAction,
  type DrivePickerConfig,
} from "@/app/actions/drive";

interface GoogleDocsViewInstance {
  setMimeTypes: (types: string) => GoogleDocsViewInstance;
  setMode: (mode: string) => GoogleDocsViewInstance;
}

interface GooglePickerBuilderInstance {
  addView: (view: unknown) => GooglePickerBuilderInstance;
  setOAuthToken: (token: string) => GooglePickerBuilderInstance;
  setDeveloperKey: (key: string) => GooglePickerBuilderInstance;
  setAppId?: (appId: string) => GooglePickerBuilderInstance;
  setCallback: (cb: (data: PickerResponse) => void) => GooglePickerBuilderInstance;
  setTitle: (title: string) => GooglePickerBuilderInstance;
  enableFeature: (feature: unknown) => GooglePickerBuilderInstance;
  setSize: (width: number, height: number) => GooglePickerBuilderInstance;
  build: () => { setVisible: (visible: boolean) => void };
}

declare global {
  interface Window {
    gapi?: {
      load: (api: string, options: { callback: () => void; onerror?: () => void }) => void;
    };
    google?: {
      picker?: {
        PickerBuilder: new () => GooglePickerBuilderInstance;
        DocsView: new (viewId?: string) => GoogleDocsViewInstance;
        ViewId: {
          DOCS: string;
          DOCS_IMAGES_AND_VIDEOS: string;
        };
        DocsViewMode: {
          GRID: string;
          LIST: string;
        };
        Feature: {
          MULTISELECT_ENABLED: string;
          NAV_HIDDEN: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        Response: {
          ACTION: string;
          DOCUMENTS: string;
        };
        Document: {
          ID: string;
          NAME: string;
          MIME_TYPE: string;
        };
      };
    };
  }
}

interface PickerDoc {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
  [key: string]: unknown;
}

let gapiScriptLoadingPromise: Promise<void> | null = null;

function loadGooglePickerScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser environment required"));
  if (window.gapi && window.google?.picker) return Promise.resolve();
  if (gapiScriptLoadingPromise) return gapiScriptLoadingPromise;

  gapiScriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://apis.google.com/js/api.js"]');
    const onLoaded = () => {
      if (!window.gapi) {
        reject(new Error("Google API script failed to initialize"));
        return;
      }
      window.gapi.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Failed to initialize Google Picker library")),
      });
    };

    if (existing) {
      if (window.gapi?.load) {
        onLoaded();
      } else {
        existing.addEventListener("load", onLoaded, { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Google API script")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = onLoaded;
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.body.appendChild(script);
  });

  return gapiScriptLoadingPromise;
}

/**
 * Google Drive file picker powered by the official Google Picker API and least-privilege `drive.file` scope.
 * Only the specific files chosen by the user in Google's secure dialog are accessed and imported.
 */
export function DrivePicker({
  folderId = null,
  onImported,
}: {
  folderId?: string | null;
  onImported: (assetId: string) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [launching, setLaunching] = React.useState(false);
  const [importing, setImporting] = React.useState<number | null>(null);
  const [config, setConfig] = React.useState<DrivePickerConfig | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    getDrivePickerConfigAction().then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok && res.data) {
        setConfig(res.data);
      } else {
        setError(res.error ?? "Failed to connect to Google Drive");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handlePickerCallback = React.useCallback(
    async (data: PickerResponse) => {
      const action = data[window.google?.picker?.Response?.ACTION ?? "action"] || data.action;

      if (action === window.google?.picker?.Action?.CANCEL || action === "cancel") {
        setLaunching(false);
        return;
      }

      if (action === window.google?.picker?.Action?.PICKED || action === "picked") {
        const rawDocs = (data[window.google?.picker?.Response?.DOCUMENTS ?? "docs"] || data.docs || []) as PickerDoc[];
        if (rawDocs.length === 0) {
          setLaunching(false);
          return;
        }

        const files = rawDocs.map((d) => ({
          fileId: d.id,
          name: d.name || "drive-file",
        }));

        setLaunching(false);
        setImporting(files.length);

        const res = await importDriveFilesAction({ files, folderId });
        setImporting(null);

        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
          toast({
            title: res.data.length === 1 ? "File imported" : `${res.data.length} files imported`,
            description: "Asset successfully added to MultiPost Studio",
            tone: "success",
          });
          onImported(res.data[0]);
        } else {
          toast({
            title: "Import failed",
            description: res.error ?? "Could not import the selected file(s)",
            tone: "error",
          });
        }
      }
    },
    [folderId, onImported, toast],
  );

  const openPicker = React.useCallback(async () => {
    if (!config?.accessToken) {
      toast({ title: "Session error", description: "Google Drive access token missing", tone: "error" });
      return;
    }
    if (!config.developerKey) {
      toast({
        title: "Configuration needed",
        description: "Google Picker API Key (NEXT_PUBLIC_GOOGLE_PICKER_API_KEY) is not set in the environment.",
        tone: "error",
      });
      return;
    }

    setLaunching(true);
    try {
      await loadGooglePickerScript();

      if (!window.google?.picker) {
        throw new Error("Google Picker is unavailable");
      }

      // Filter to images and videos
      const docsView = new window.google.picker.DocsView()
        .setMimeTypes("image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm")
        .setMode(window.google.picker.DocsViewMode.GRID);

      const builder = new window.google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.developerKey)
        .setCallback(handlePickerCallback)
        .setTitle("Select media from Google Drive")
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setSize(1000, 600);

      if (config.clientId) {
        const appId = config.clientId.split("-")[0];
        if (appId && builder.setAppId) {
          builder.setAppId(appId);
        }
      }

      const picker = builder.build();
      picker.setVisible(true);
    } catch (e) {
      setLaunching(false);
      const msg = e instanceof Error ? e.message : "Failed to launch Google Picker";
      toast({ title: "Picker launch failed", description: msg, tone: "error" });
    }
  }, [config, handlePickerCallback, toast]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-muted)]">
        <Loader2 size={18} className="animate-spin text-[var(--primary)]" />
        <p className="text-[13px]">Connecting to Google Drive…</p>
      </div>
    );
  }

  // Not connected state
  if (error || !config?.connected) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
          <HardDrive size={20} />
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text)]">Google Drive not connected</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Connect your Google Drive account to import images and videos directly into your media library or composer.
        </p>
        <div className="mt-4">
          <Button size="sm" asChild>
            <a href="/integrations">Connect Google Drive in Integrations</a>
          </Button>
        </div>
      </div>
    );
  }

  // Legacy connection detected (needs reconnect for drive.file)
  if (config.needsReconnect) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-[var(--warning)]" />
          <div className="flex-1">
            <h4 className="text-[14px] font-semibold text-[var(--text)]">
              Update required for Google Drive
            </h4>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Your Google Drive connection was authorized with legacy permissions. MultiPost Studio has upgraded to
              Google&apos;s least-privilege file picker, ensuring we only access files you explicitly choose.
            </p>
            <div className="mt-3.5 flex items-center gap-3">
              <Button size="sm" asChild>
                <a href="/api/integrations/google_drive/start" className="gap-1.5">
                  <RefreshCw size={13} /> Reconnect Google Drive
                </a>
              </Button>
              <a
                href="/integrations"
                className="text-[12.5px] text-[var(--text-subtle)] hover:text-[var(--text)] hover:underline"
              >
                Manage integrations
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Missing API key warning in developer/admin environment
  if (!config.developerKey) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--primary)]" />
          <div>
            <h4 className="text-[14px] font-semibold text-[var(--text)]">Google Picker API Key needed</h4>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              To open Google&apos;s file selector, configure{" "}
              <code className="rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[12px] font-mono">
                NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
              </code>{" "}
              in your environment variables.
            </p>
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
              Create an API key in Google Cloud Console with the Google Picker API enabled and restricted to your app
              domain.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active, ready state
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--primary)]">
          <HardDrive size={24} />
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text)]">Import from Google Drive</h3>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-muted)]">
          Select images or videos from your Google Drive. Only the specific files you pick will be imported into
          MultiPost Studio.
        </p>

        {config.accountEmail && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-[12px] text-[var(--text-subtle)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            Connected as {config.accountEmail}
          </p>
        )}

        <div className="mt-5 flex justify-center">
          <Button
            size="md"
            onClick={openPicker}
            disabled={launching || importing !== null}
            loading={launching || importing !== null}
          >
            {importing !== null ? (
              `Importing ${importing} file${importing === 1 ? "" : "s"}…`
            ) : launching ? (
              "Opening Google Drive…"
            ) : (
              "Browse Google Drive"
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[12px] text-[var(--text-subtle)]">
        <ShieldCheck size={14} className="shrink-0 text-[var(--success)]" />
        <span>
          Privacy first: MultiPost Studio uses the least-privilege <code>drive.file</code> permission. We never scan or
          read any unselected files.
        </span>
      </div>
    </div>
  );
}
