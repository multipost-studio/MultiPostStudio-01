"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Power, RotateCcw, Save, Undo2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { importFestivalConfigAction, resetFestivalConfigAction, saveFestivalConfigAction } from "@/app/actions/admin-festivals";
import { setFestivalPreview } from "@/components/festival/preview";
import { addDays, formatYmd } from "@/lib/festivals/calendar";
import { FESTIVALS, FESTIVAL_BY_ID } from "@/lib/festivals/catalog";
import { MAX_IMPORT_BYTES, TIMEZONES, parseFestivalConfig } from "@/lib/festivals/config";
import { resolveFestivals } from "@/lib/festivals/resolve";
import type { FestivalConfig, FestivalOverride, Intensity } from "@/lib/festivals/types";
import { cn } from "@/lib/utils";
import { CustomFestivals } from "./_custom";
import { FestivalCard, paletteGradient, type Occurrence } from "./_festival-card";

export type NextMap = Record<string, Occurrence>;
export type ActivityRow = { id: string; action: string; at: string; by: string };

const SOURCE_LABEL = { manual: "Turned on by an admin", custom: "Scheduled event", auto: "Automatic, by the calendar" } as const;
const ACTIVITY_LABEL: Record<string, string> = {
  "admin.festival_config_updated": "saved the settings",
  "admin.festival_config_imported": "imported settings",
  "admin.festival_config_reset": "reset the settings",
};
const INTENSITY: { value: Intensity; label: string }[] = [
  { value: "low", label: "Subtle" },
  { value: "medium", label: "Balanced" },
  { value: "high", label: "Festive" },
];
const RUN_FOR = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "A week" },
  { days: 14, label: "2 weeks" },
  { days: 0, label: "Until I stop it" },
];

function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--text-muted)]">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[var(--text)]">{title}</p>
        {hint && <p className="text-[12.5px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function FestivalsClient({ initialConfig, nowMs, nexts, activity }: { initialConfig: FestivalConfig; nowMs: number; nexts: NextMap; activity: ActivityRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initialConfig);
  const [draft, setDraft] = React.useState(initialConfig);
  const [busy, setBusy] = React.useState<null | "save" | "live" | "import" | "reset">(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [importErrors, setImportErrors] = React.useState<string[]>([]);
  const [liveDialog, setLiveDialog] = React.useState<string | null>(null);
  const [runFor, setRunFor] = React.useState(3);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const check = parseFestivalConfig(draft);
  const visitors = resolveFestivals(saved, nowMs);
  const ifSaved = resolveFestivals(draft, nowMs);
  const liveTheme = visitors.active ? FESTIVAL_BY_ID[visitors.active.themeId] : null;
  const liveId = visitors.active?.id ?? null;
  const changesOutcome = dirty && (ifSaved.active?.id ?? null) !== liveId;

  const patch = (p: Partial<FestivalConfig>) => setDraft((d) => ({ ...d, ...p }));
  const setOv = (id: string, p: Partial<FestivalOverride>) =>
    setDraft((d) => {
      const merged: Record<string, unknown> = { ...d.overrides[id], ...p };
      for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === "") delete merged[k];
      const overrides = { ...d.overrides };
      if (Object.keys(merged).length === 0) delete overrides[id];
      else overrides[id] = merged as FestivalOverride;
      return { ...d, overrides };
    });

  function adopt(config: FestivalConfig) {
    setSaved(config);
    setDraft(config);
    setErrors([]);
    router.refresh();
  }

  async function save(next: FestivalConfig) {
    setBusy("save");
    setErrors([]);
    const res = await saveFestivalConfigAction(next);
    setBusy(null);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, description: "Visitors see it within a minute.", tone: "success" });
    } else setErrors(res.errors);
  }

  /** Publishes one change on top of what is already live. Unsaved edits stay in the draft, with the same change mirrored in. */
  async function quick(nextSaved: FestivalConfig, mirror: (d: FestivalConfig) => FestivalConfig, title: string) {
    setBusy("live");
    const res = await saveFestivalConfigAction(nextSaved);
    setBusy(null);
    if (res.ok) {
      setSaved(res.config);
      setDraft(mirror);
      router.refresh();
      toast({ title, description: "Visitors see it within a minute.", tone: "success" });
    } else toast({ title: "Couldn't save", description: res.errors[0], tone: "error" });
  }

  const goLive = (id: string) => {
    if (!saved.enabled) return toast({ title: "Festival themes are switched off", description: "Turn them on under Controls and save first.", tone: "warning" });
    if (id.startsWith("custom-") && !saved.custom.some((c) => c.id === id)) return toast({ title: "Save your changes first", description: "This event is not published yet.", tone: "warning" });
    setRunFor(id.startsWith("custom-") ? 0 : 3);
    setLiveDialog(id);
  };

  async function confirmLive() {
    if (!liveDialog) return;
    const today = visitors.today;
    const until = runFor > 0 ? addDays(today, runFor - 1) : null;
    const id = liveDialog;
    setLiveDialog(null);
    const name = FESTIVAL_BY_ID[id]?.name ?? saved.custom.find((c) => c.id === id)?.name ?? "Festival";
    const manual = { festivalId: id, until };
    await quick({ ...saved, manual }, (d) => ({ ...d, manual }), `${name} is live`);
  }

  async function stopNow() {
    const a = visitors.active;
    if (!a) return;
    if (a.source === "manual") {
      const manual = { festivalId: null, until: null };
      return void (await quick({ ...saved, manual }, (d) => ({ ...d, manual }), "Festival turned off"));
    }
    if (a.source === "auto") {
      const skip = (c: FestivalConfig): FestivalConfig => ({ ...c, overrides: { ...c.overrides, [a.id]: { ...c.overrides[a.id], auto: false } } });
      return void (await quick(skip(saved), skip, `${a.name} won't auto-enable`));
    }
    toast({ title: "Scheduled events end on their own", description: "Remove the event below to stop it early.", tone: "info" });
  }

  const preview = (themeId: string) => {
    setFestivalPreview(themeId);
    toast({ title: `Previewing ${FESTIVAL_BY_ID[themeId]?.name ?? "theme"}`, description: "Only on this device. End it from the chip at the top.", tone: "info" });
  };

  function exportJson() {
    const body = JSON.stringify({ exportedAt: new Date(nowMs).toISOString(), config: saved }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "festival-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setImportErrors([]);
    if (file.size > MAX_IMPORT_BYTES) return setImportErrors([`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`]);
    setBusy("import");
    const res = await importFestivalConfigAction(await file.text());
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else setImportErrors(res.errors);
  }

  async function reset() {
    setBusy("reset");
    const res = await resetFestivalConfigAction();
    setBusy(null);
    setConfirmReset(false);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else toast({ title: "Couldn't reset", description: res.errors[0], tone: "error" });
  }

  const zones = TIMEZONES.includes(draft.timezone as never) ? [...TIMEZONES] : [draft.timezone, ...TIMEZONES];

  return (
    <div className="space-y-5 pb-24">
      {/* Status */}
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div aria-hidden className="h-1.5" style={{ background: liveTheme ? paletteGradient(liveTheme.colors) : "var(--border)" }} />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span aria-hidden className="text-[40px] leading-none">{liveTheme?.emoji ?? "🎈"}</span>
          <div className="min-w-0 flex-1">
            {visitors.active && liveTheme ? (
              <>
                <p className="flex flex-wrap items-center gap-2 text-[20px] font-semibold text-[var(--text)]">
                  {visitors.active.name} is live <Badge tone="success">{SOURCE_LABEL[visitors.active.source]}</Badge>
                </p>
                <p className="text-[13.5px] text-[var(--text-muted)]">
                  {visitors.active.endsOn ? `Until ${formatYmd(visitors.active.endsOn)}` : "Until you turn it off"} · {liveTheme.effect} effect · {saved.audience.marketing ? "site " : ""}
                  {saved.audience.app ? "app " : ""}
                  {saved.audience.admin ? "admin" : ""}
                </p>
              </>
            ) : (
              <>
                <p className="text-[20px] font-semibold text-[var(--text)]">{saved.enabled ? "No festival is live" : "Festival themes are switched off"}</p>
                <p className="text-[13.5px] text-[var(--text-muted)]">
                  {saved.enabled ? (saved.autoMode ? "Automatic mode is on. The next one starts on its own." : "Automatic mode is off. Pick a festival below to go live.") : "Nothing shows to anyone until you switch them on."}
                </p>
              </>
            )}
            {changesOutcome && <p className="mt-1 text-[13px] text-[var(--warning)]">Your unsaved changes would make {ifSaved.active ? `${ifSaved.active.name} go live` : "this festival stop"}.</p>}
          </div>
          {visitors.active && (
            <Button variant="secondary" size="sm" onClick={stopNow} disabled={busy !== null}>
              <Power size={13} aria-hidden /> Turn off
            </Button>
          )}
        </div>
        {visitors.upcoming.length > 0 && (
          <div className="border-t border-[var(--border)] px-5 py-3">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Coming up</p>
            <ul className="flex flex-wrap gap-2">
              {visitors.upcoming.slice(0, 5).map((u) => (
                <li key={u.id} className="rounded-full border border-[var(--border)] px-3 py-1 text-[13px] text-[var(--text-muted)]">
                  <span aria-hidden>{u.emoji}</span> <span className="font-medium text-[var(--text)]">{u.name}</span> · {u.daysAway <= 0 ? "now" : u.daysAway === 1 ? "tomorrow" : `in ${u.daysAway} days`} ({formatYmd(u.startsOn)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Controls */}
      <Section title="Controls" description="Master switches, how the effects look, and where visitors see them.">
        <div className="grid gap-x-10 lg:grid-cols-2">
          <div className="divide-y divide-[var(--border)]">
            <Row title="Festival themes" hint="Master switch. Off hides everything.">
              <Switch checked={draft.enabled} onCheckedChange={(v) => patch({ enabled: v })} srLabel="Festival themes" />
            </Row>
            <Row title="Automatic by calendar" hint="Turn festivals on and off around their dates.">
              <Switch checked={draft.autoMode} onCheckedChange={(v) => patch({ autoMode: v })} srLabel="Automatic by calendar" />
            </Row>
            <Row title="Time zone" hint="Decides when a festival day starts.">
              <Select size="sm" aria-label="Time zone" value={draft.timezone} onChange={(e) => patch({ timezone: e.target.value })} className="w-48">
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Row>
            <Row title="Intensity" hint="How many particles drift across the screen.">
              <div className="inline-flex rounded-full border border-[var(--border)]/70 bg-[var(--bg-sunken)] p-1" role="radiogroup" aria-label="Intensity">
                {INTENSITY.map((o) => (
                  <button
                    key={o.value}
                    role="radio"
                    aria-checked={draft.intensity === o.value}
                    onClick={() => patch({ intensity: o.value })}
                    className={cn("h-7 rounded-full px-3 text-[13px] font-medium transition-colors", draft.intensity === o.value ? "bg-[var(--text)] text-[var(--bg-elevated)]" : "text-[var(--text-muted)] hover:text-[var(--text)]")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Row>
          </div>
          <div className="divide-y divide-[var(--border)]">
            <Row title="Particles" hint="Confetti, petals, snow, sparks…">
              <Switch checked={draft.effects.particles} onCheckedChange={(v) => patch({ effects: { ...draft.effects, particles: v } })} srLabel="Particles" />
            </Row>
            <Row title="Ribbon and glow" hint="A colour ribbon and soft wash at the top.">
              <Switch checked={draft.effects.glow} onCheckedChange={(v) => patch({ effects: { ...draft.effects, glow: v } })} srLabel="Ribbon and glow" />
            </Row>
            <Row title="Greeting" hint="A short message the first time someone sees it.">
              <Switch checked={draft.effects.greeting} onCheckedChange={(v) => patch({ effects: { ...draft.effects, greeting: v } })} srLabel="Greeting" />
            </Row>
            <Row title="Tint highlights" hint="Recolour accents. Buttons and text stay on brand.">
              <Switch checked={draft.effects.recolor} onCheckedChange={(v) => patch({ effects: { ...draft.effects, recolor: v } })} srLabel="Tint highlights" />
            </Row>
          </div>
        </div>
        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3">
          <p className="mb-1 text-[13px] font-semibold text-[var(--text)]">Where visitors see it</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Switch checked={draft.audience.marketing} onCheckedChange={(v) => patch({ audience: { ...draft.audience, marketing: v } })} label="Marketing site" />
            <Switch checked={draft.audience.app} onCheckedChange={(v) => patch({ audience: { ...draft.audience, app: v } })} label="In the app" />
            <Switch checked={draft.audience.admin} onCheckedChange={(v) => patch({ audience: { ...draft.audience, admin: v } })} label="Admin panel" />
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-subtle)]">People with reduced-motion or data-saver on never see particles, and any visitor can turn the effects off for themselves from the greeting.</p>
        </div>
      </Section>

      {/* Presets */}
      <Section title="Festival presets" description="Preview any of them on this device, switch one on right now, or tune how each runs automatically.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FESTIVALS.map((f) => (
            <FestivalCard
              key={f.id}
              festival={f}
              override={draft.overrides[f.id]}
              next={nexts[f.id] ?? null}
              live={liveId === f.id ? visitors.active!.source : null}
              busy={busy !== null}
              onPatch={(p) => setOv(f.id, p)}
              onPreview={() => preview(f.id)}
              onGoLive={() => goLive(f.id)}
            />
          ))}
        </div>
      </Section>

      <Section title="Your own events" description="A launch week, a sale or an anniversary, dressed in any preset's look. Custom events beat the preset calendar.">
        <CustomFestivals items={draft.custom} today={visitors.today} liveId={liveId} busy={busy !== null} onChange={(custom) => patch({ custom })} onPreview={preview} onGoLive={goLive} />
      </Section>

      <Section title="Backup" description="Export these settings, bring them into another environment, or start over.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportJson}>
            <Download size={13} aria-hidden /> Export
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={busy === "import"}>
            <Upload size={13} aria-hidden /> Import
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} className="ml-auto">
            <RotateCcw size={13} aria-hidden /> Reset to defaults
          </Button>
        </div>
        {importErrors.length > 0 && (
          <ul role="alert" className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-[var(--danger)]">
            {importErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {activity.length > 0 && (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Recent changes</p>
            <ul className="space-y-1 text-[13px] text-[var(--text-muted)]">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-[var(--text)]">{a.by}</span> {ACTIVITY_LABEL[a.action] ?? a.action} · {formatYmd(a.at.slice(0, 10))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Save bar */}
      {(dirty || errors.length > 0) && (
        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-[55] mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 shadow-lg md:left-[16rem]">
          <div className="min-w-0 flex-1 text-[13.5px]">
            {errors.length > 0 ? (
              <p role="alert" className="text-[var(--danger)]">{errors[0]}</p>
            ) : !check.ok ? (
              <p className="text-[var(--danger)]">{check.errors[0]}</p>
            ) : (
              <p className="text-[var(--text)]">You have unsaved changes.</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setDraft(saved); setErrors([]); }} disabled={busy !== null}>
            <Undo2 size={13} aria-hidden /> Discard
          </Button>
          <Button size="sm" onClick={() => void save(draft)} loading={busy === "save"} disabled={!check.ok}>
            <Save size={13} aria-hidden /> Save
          </Button>
        </div>
      )}

      <Modal
        open={liveDialog !== null}
        onClose={() => setLiveDialog(null)}
        title={`Go live with ${liveDialog ? (FESTIVAL_BY_ID[liveDialog]?.name ?? saved.custom.find((c) => c.id === liveDialog)?.name ?? "this festival") : ""}`}
        description="It overrides the calendar until it ends. Visitors see it within a minute."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLiveDialog(null)}>Cancel</Button>
            <Button onClick={() => void confirmLive()}>Go live</Button>
          </>
        }
      >
        <p className="mb-2 text-[13.5px] font-medium text-[var(--text)]">How long should it run?</p>
        <div className="flex flex-wrap gap-2">
          {RUN_FOR.map((o) => (
            <button key={o.days} type="button" onClick={() => setRunFor(o.days)} aria-pressed={runFor === o.days} className={cn("h-8 rounded-full border px-3 text-[13px] font-medium transition-colors", runFor === o.days ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)]")}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-[var(--text-subtle)]">
          <Eye size={13} aria-hidden /> Want to see it first? Close this and use Preview.
        </p>
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset festival settings?"
        description="Everything returns to the defaults: festival themes on, automatic mode off, no custom events. Export first if you want a copy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void reset()} loading={busy === "reset"}>Reset</Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-muted)]">Whatever is live right now will stop for visitors within a minute.</p>
      </Modal>
    </div>
  );
}
