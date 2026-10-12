import type { NotificationPriority } from "./types";

/**
 * The in-app notification chime, made with the browser's own audio engine: no audio file to download, nothing to license,
 * and it works offline. Browsers only allow sound after the person has touched the page once, so `unlockAudio` is called on the
 * first tap or key press; until then a chime is simply skipped. Nothing here can throw into the app.
 */

export type ChimeKind = "default" | "alert";

type Note = { freq: number; at: number; dur: number };

/** A soft rising two-note chime, and a three-note alert for critical notifications. Times are in seconds. */
export const CHIMES: Record<ChimeKind, Note[]> = {
  default: [
    { freq: 659.25, at: 0, dur: 0.18 },
    { freq: 880, at: 0.13, dur: 0.3 },
  ],
  alert: [
    { freq: 880, at: 0, dur: 0.14 },
    { freq: 659.25, at: 0.17, dur: 0.14 },
    { freq: 880, at: 0.34, dur: 0.32 },
  ],
};

/** Critical notifications sound different from everything else, so they stand out without looking. */
export function chimeFor(priorities: readonly (NotificationPriority | string)[]): ChimeKind {
  return priorities.includes("critical") ? "alert" : "default";
}

/** Two chimes closer together than this are one: a burst of notifications makes one sound, not a ring. */
export const MIN_GAP_MS = 1200;

/** Volume (0 to 100) to the output level of one note. Capped low on purpose: this is a nudge, not an alarm. */
export function gainFor(volume: number): number {
  const v = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 0;
  return (v / 100) * 0.22;
}

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let lastPlayedAt = 0;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a tap or key press: lets later chimes play. Safe to call repeatedly. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

function schedule(c: AudioContext, kind: ChimeKind, volume: number): void {
  const peak = Math.max(gainFor(volume), 0.0002);
  for (const n of CHIMES[kind]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + n.at;
    osc.type = "sine";
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.05);
  }
}

/**
 * Play the chime. Returns false when it chose not to (muted, too soon after the last one, no audio support, or the browser
 * has not been allowed to make sound yet). `force` skips the spacing rule, for the "play a sample" button.
 */
export function playNotificationSound(volume: number, kind: ChimeKind = "default", opts: { force?: boolean; now?: number } = {}): boolean {
  if (gainFor(volume) <= 0) return false;
  const now = opts.now ?? Date.now();
  if (!opts.force && now - lastPlayedAt < MIN_GAP_MS) return false;
  const c = context();
  if (!c) return false;
  try {
    if (c.state === "suspended") {
      // Allowed only after the person has interacted with the page; otherwise the promise rejects and nothing plays.
      void c.resume().then(() => schedule(c, kind, volume)).catch(() => undefined);
      lastPlayedAt = now;
      return true;
    }
    schedule(c, kind, volume);
    lastPlayedAt = now;
    return true;
  } catch {
    return false;
  }
}

/** For tests: forget the audio context and the last-played time. */
export function resetSoundForTests(): void {
  ctx = null;
  lastPlayedAt = 0;
}
