"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { chimeFor, playNotificationSound, unlockAudio } from "@/lib/notifications/sound";
import { saveNotificationPrefsAction } from "@/app/actions/notifications";
import { MILESTONE_CHOICES, REMINDER_OFFSETS, type NotificationSettings } from "@/lib/notifications/prefs";
import { CATEGORIES, CATEGORY_LABEL, NOTIFICATION_TYPES, type NotificationCategory, type NotificationPriority } from "@/lib/notifications/types";

const PRIORITY_CHOICES: { value: NotificationPriority; label: string }[] = [
  { value: "low", label: "Everything" },
  { value: "normal", label: "Normal and above" },
  { value: "high", label: "Important only (high and critical)" },
  { value: "critical", label: "Critical only" },
];

type Flags = {
  emailPublish: boolean;
  emailApproval: boolean;
  emailMentions: boolean;
  emailWeeklyDigest: boolean;
  emailReports: boolean;
  inappAll: boolean;
};

const EMAIL_ROWS: { key: keyof Flags; label: string; hint: string }[] = [
  { key: "emailPublish", label: "Publishing results", hint: "Email me when a post fails to publish or misses its slot" },
  { key: "emailApproval", label: "Approval requests", hint: "Email me when something needs my review" },
  { key: "emailMentions", label: "Mentions & comments", hint: "Email me when I'm @mentioned" },
  { key: "emailWeeklyDigest", label: "Weekly analytics digest", hint: "A performance summary every Monday" },
  { key: "emailReports", label: "Scheduled reports", hint: "Email me workspace reports on their schedule" },
];

const OFFSET_LABEL: Record<number, string> = { 1440: "24 hours before", 60: "1 hour before", 15: "15 minutes before" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[16px] font-semibold text-[var(--text)]">{title}</h2>
      {hint && <p className="mt-0.5 text-[14px] text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-3 divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, control }: { label: string; hint?: string; control: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[var(--text)]">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] text-[var(--text-subtle)]">{hint}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3.5 pl-0 text-[13px] text-[var(--text-muted)]">{children}</div>;
}

function NumberSelect({ label, value, options, onChange, suffix }: { label: string; value: number; options: number[]; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="inline-flex items-center gap-2">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 text-[13px] text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {suffix === "hour" ? `${String(o).padStart(2, "0")}:00` : o}
          </option>
        ))}
      </select>
      {suffix && suffix !== "hour" && <span>{suffix}</span>}
    </label>
  );
}

function Pill({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
      <span>{children}</span>
    </label>
  );
}

export function NotificationPrefsForm({ flags: initialFlags, settings: initialSettings }: { flags: Flags; settings: NotificationSettings }) {
  const [flags, setFlags] = useState(initialFlags);
  const [s, setS] = useState(initialSettings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setPushCat = (c: NotificationCategory, v: boolean) => setS((cur) => ({ ...cur, push: { ...cur.push, categories: { ...cur.push.categories, [c]: v } } }));
  const setCat = (c: NotificationCategory, v: boolean) => setS((cur) => ({ ...cur, categories: { ...cur.categories, [c]: v } }));
  const toggleList = (list: number[], v: number, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

  const save = () => {
    setMsg(null);
    start(async () => {
      const r = await saveNotificationPrefsAction({ ...flags, settings: s }).catch(() => ({ ok: false, message: "Couldn't save your preferences. Please try again." }));
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Saved" : "Couldn't save") });
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section title="In the app" hint="What shows up in the bell and on the Notifications page.">
        <Row
          label="In-app notifications"
          hint="The master switch. Critical alerts (failed payments, security changes, a disconnected account) still arrive when this is off."
          control={<Switch srLabel="In-app notifications" checked={flags.inappAll} onCheckedChange={(v) => setFlags((f) => ({ ...f, inappAll: v }))} />}
        />
        <Row
          label="Pop-up for new notifications"
          hint="A short toast when something new arrives while you're using the app"
          control={<Switch srLabel="Pop-up for new notifications" checked={s.toasts} onCheckedChange={(v) => setS((c) => ({ ...c, toasts: v }))} />}
        />
        <Row
          label="“Post published” confirmations"
          hint="Failures and partial failures always notify; this only controls the success message"
          control={<Switch srLabel="Post published confirmations" checked={s.publishSuccess} onCheckedChange={(v) => setS((c) => ({ ...c, publishSuccess: v }))} />}
        />
      </Section>

      <Section title="By category" hint="Choose which kinds of activity appear in the app.">
        {CATEGORIES.map((c) => {
          const types = NOTIFICATION_TYPES.filter((t) => t.category === c);
          const requiredOnly = types.length > 0 && types.every((t) => t.required);
          return (
            <Row
              key={c}
              label={CATEGORY_LABEL[c]}
              hint={`${types.map((t) => t.label).join(", ")}${types.some((t) => t.required) ? (requiredOnly ? ". Always on." : ". Critical ones are always on.") : ""}`}
              control={
                <Switch
                  srLabel={`${CATEGORY_LABEL[c]} notifications`}
                  checked={requiredOnly ? true : s.categories[c]}
                  disabled={requiredOnly}
                  onCheckedChange={(v) => setCat(c, v)}
                />
              }
            />
          );
        })}
      </Section>

      <Section title="Push & sound" hint="How alerts reach you when you are away from the app, and the chime when you are in it. Turn on a device in the box above first.">
        <div>
          <Row
            label="Browser & phone notifications"
            hint="The master switch for every device you turned on. Critical alerts (failed payments, security changes, a disconnected account) follow it too."
            control={<Switch srLabel="Browser and phone notifications" checked={s.push.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, push: { ...c.push, enabled: v } }))} />}
          />
          {s.push.enabled && (
            <>
              <Sub>
                <label className="inline-flex items-center gap-2">
                  <span>Notify me for</span>
                  <select
                    value={s.push.minPriority}
                    onChange={(e) => setS((c) => ({ ...c, push: { ...c.push, minPriority: e.target.value as NotificationPriority } }))}
                    className="h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 text-[13px] text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  >
                    {PRIORITY_CHOICES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-[12px] text-[var(--text-subtle)]">Everything still appears in the bell.</span>
              </Sub>
              <Sub>
                <span className="font-medium text-[var(--text)]">Notify me about</span>
                {CATEGORIES.map((c) => (
                  <Pill key={c} checked={s.push.categories[c]} onChange={(on) => setPushCat(c, on)}>
                    {CATEGORY_LABEL[c]}
                  </Pill>
                ))}
              </Sub>
              <div>
                <Row
                  label="Quiet hours"
                  hint="No pushes during this window, except critical alerts. They are waiting in the bell when you are back."
                  control={<Switch srLabel="Quiet hours" checked={s.push.quietHours.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, push: { ...c.push, quietHours: { ...c.push.quietHours, enabled: v } } }))} />}
                />
                {s.push.quietHours.enabled && (
                  <Sub>
                    <label className="inline-flex items-center gap-2">
                      <span>From</span>
                      <input
                        type="time"
                        value={s.push.quietHours.start}
                        onChange={(e) => e.target.value && setS((c) => ({ ...c, push: { ...c.push, quietHours: { ...c.push.quietHours, start: e.target.value } } }))}
                        className="h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 text-[13px] text-[var(--text)]"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <span>To</span>
                      <input
                        type="time"
                        value={s.push.quietHours.end}
                        onChange={(e) => e.target.value && setS((c) => ({ ...c, push: { ...c.push, quietHours: { ...c.push.quietHours, end: e.target.value } } }))}
                        className="h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 text-[13px] text-[var(--text)]"
                      />
                    </label>
                    <span className="text-[12px] text-[var(--text-subtle)]">in your profile timezone</span>
                  </Sub>
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <Row
            label="Notification sound"
            hint="A short chime when something new arrives while the app is open. Critical alerts sound different."
            control={<Switch srLabel="Notification sound" checked={s.sound.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, sound: { ...c.sound, enabled: v } }))} />}
          />
          {s.sound.enabled && (
            <Sub>
              <label className="inline-flex items-center gap-2">
                <span>Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={s.sound.volume}
                  onChange={(e) => setS((c) => ({ ...c, sound: { ...c.sound, volume: Number(e.target.value) } }))}
                  aria-label="Notification volume"
                  className="w-36 accent-[var(--primary)]"
                />
                <span className="w-9 tabular-nums">{s.sound.volume}%</span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  unlockAudio();
                  playNotificationSound(s.sound.volume, chimeFor([]), { force: true });
                }}
              >
                Play sample
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  unlockAudio();
                  playNotificationSound(s.sound.volume, chimeFor(["critical"]), { force: true });
                }}
              >
                Play critical sample
              </Button>
            </Sub>
          )}
        </div>
      </Section>

      <Section title="Email" hint="Which notifications are also sent to your inbox. Security and billing-failure alerts are always emailed.">
        {EMAIL_ROWS.map((r) => (
          <Row
            key={r.key}
            label={r.label}
            hint={r.hint}
            control={<Switch srLabel={r.label} checked={flags[r.key]} onCheckedChange={(v) => setFlags((f) => ({ ...f, [r.key]: v }))} />}
          />
        ))}
      </Section>

      <Section title="Reminders" hint="Nudges that help you stay on schedule. Each one is sent at most once per post or per period.">
        <div>
          <Row
            label="Scheduled post reminders"
            hint="A heads-up before one of your scheduled posts goes out"
            control={<Switch srLabel="Scheduled post reminders" checked={s.scheduledReminders.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, scheduledReminders: { ...c.scheduledReminders, enabled: v } }))} />}
          />
          {s.scheduledReminders.enabled && (
            <Sub>
              {REMINDER_OFFSETS.map((o) => (
                <Pill
                  key={o}
                  checked={s.scheduledReminders.offsets.includes(o)}
                  onChange={(on) => setS((c) => ({ ...c, scheduledReminders: { ...c.scheduledReminders, offsets: toggleList(c.scheduledReminders.offsets, o, on) } }))}
                >
                  {OFFSET_LABEL[o]}
                </Pill>
              ))}
            </Sub>
          )}
        </div>
        <div>
          <Row
            label="Draft reminders"
            hint="A weekly note when drafts have been sitting unfinished"
            control={<Switch srLabel="Draft reminders" checked={s.draftReminders.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, draftReminders: { ...c.draftReminders, enabled: v } }))} />}
          />
          {s.draftReminders.enabled && (
            <Sub>
              <NumberSelect label="After" value={s.draftReminders.afterDays} options={[1, 2, 3, 5, 7, 14]} suffix="days untouched" onChange={(n) => setS((c) => ({ ...c, draftReminders: { ...c.draftReminders, afterDays: n } }))} />
            </Sub>
          )}
        </div>
        <div>
          <Row
            label="Empty calendar alerts"
            hint="Tell me when nothing is scheduled for the next few days"
            control={<Switch srLabel="Empty calendar alerts" checked={s.calendarGap.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, calendarGap: { ...c.calendarGap, enabled: v } }))} />}
          />
          {s.calendarGap.enabled && (
            <Sub>
              <NumberSelect label="Look ahead" value={s.calendarGap.daysAhead} options={[1, 2, 3, 5, 7, 14]} suffix="days" onChange={(n) => setS((c) => ({ ...c, calendarGap: { ...c.calendarGap, daysAhead: n } }))} />
            </Sub>
          )}
        </div>
        <div>
          <Row
            label="“You haven't posted” nudge"
            hint="Off by default. A gentle reminder if you go a while without posting"
            control={<Switch srLabel="You haven't posted nudge" checked={s.postingReminder.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, postingReminder: { ...c.postingReminder, enabled: v } }))} />}
          />
          {s.postingReminder.enabled && (
            <Sub>
              <NumberSelect label="After" value={s.postingReminder.afterDays} options={[1, 2, 3, 5, 7, 14, 30]} suffix="days without posting" onChange={(n) => setS((c) => ({ ...c, postingReminder: { ...c.postingReminder, afterDays: n } }))} />
              <NumberSelect label="Around" value={s.postingReminder.hour} options={Array.from({ length: 24 }, (_, i) => i)} suffix="hour" onChange={(n) => setS((c) => ({ ...c, postingReminder: { ...c.postingReminder, hour: n } }))} />
              <span className="text-[12px] text-[var(--text-subtle)]">in your profile timezone</span>
            </Sub>
          )}
        </div>
        <Row
          label="Inbox follow-ups"
          hint="A daily note when a conversation assigned to you has waited over a day"
          control={<Switch srLabel="Inbox follow-ups" checked={s.inboxFollowups} onCheckedChange={(v) => setS((c) => ({ ...c, inboxFollowups: v }))} />}
        />
      </Section>

      <Section title="Milestones" hint="Celebrate when one of your posts passes an engagement level (likes, comments, shares and saves combined).">
        <div>
          <Row
            label="Engagement milestones"
            control={<Switch srLabel="Engagement milestones" checked={s.milestones.enabled} onCheckedChange={(v) => setS((c) => ({ ...c, milestones: { ...c.milestones, enabled: v } }))} />}
          />
          {s.milestones.enabled && (
            <Sub>
              {MILESTONE_CHOICES.map((m) => (
                <Pill key={m} checked={s.milestones.thresholds.includes(m)} onChange={(on) => setS((c) => ({ ...c, milestones: { ...c.milestones, thresholds: toggleList(c.milestones.thresholds, m, on) } }))}>
                  {m.toLocaleString("en-US")}
                </Pill>
              ))}
            </Sub>
          )}
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Save preferences
        </Button>
        <p role="status" aria-live="polite" className={msg?.ok ? "text-[14px] text-[var(--success)]" : "text-[14px] text-[var(--danger)]"}>
          {msg?.text}
        </p>
      </div>
    </form>
  );
}
