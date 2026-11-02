"use client";

import * as React from "react";
import Link from "next/link";
import { AtSign, Info, MapPin, Music, Pause, Play, Search, X } from "lucide-react";
import { PlatformBadge } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { searchInstagramLocationsAction, searchInstagramMusicAction } from "@/app/actions/instagram";
import type { LocationChoice, MusicChoice } from "@/lib/integrations/instagram-search";
import {
  IG_COLLABORATORS_MAX,
  IG_VOLUME_MAX,
  IG_VOLUME_MIN,
  instagramOptionNotes,
  splitUsernames,
  type IgConnection,
} from "@/lib/integrations/instagram-options";

/**
 * Instagram options for one post, laid out as a plain list: a short label on the left and one control on the right, one line
 * per option. Explanations sit behind the small "i" instead of under every field, so a new user sees what they can set, not
 * paragraphs. Music and location only work for accounts connected through Facebook (Meta doesn't offer them on Instagram
 * Login); for other accounts those rows say so in one short line with a link to reconnect.
 */

const MINUTES = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="img"
      className="inline-flex cursor-help items-center text-[var(--text-subtle)] hover:text-[var(--text-muted)]"
    >
      <Info size={13} aria-hidden="true" />
    </span>
  );
}

/** One option: label (with an optional "i") on the left, control on the right. Stacks on narrow screens. */
function Row({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 py-2 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start">
      <p className="flex items-center gap-1 pt-1 text-[12.5px] font-medium text-[var(--text)]">
        {label}
        {info && <Hint text={info} />}
      </p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** For accounts that can't use an option: one quiet line and a way out, not instructions. */
function NeedsFacebook() {
  return (
    <p className="pt-1 text-[12.5px] text-[var(--text-subtle)]">
      Needs a Facebook connection.{" "}
      <Link href="/integrations" className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
        Reconnect
      </Link>
    </p>
  );
}

const FACEBOOK_WHY =
  "Instagram only offers this to accounts connected through Facebook. In Integrations, reconnect this account with “Connect Instagram through Facebook”.";

export function InstagramOptions({
  accountId,
  contentType,
  connection,
  meta,
  onChange,
  disabled,
}: {
  accountId?: string;
  contentType: string;
  connection: IgConnection;
  meta: Record<string, string>;
  onChange: (updates: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const isReel = contentType === "reel";
  const isStory = contentType === "story";
  const viaFacebook = connection === "facebook";
  const notes = instagramOptionNotes(meta, { contentType, connection });

  const collaboratorsRaw = meta.igCollaborators ?? "";
  const { invalid: badCollabs } = splitUsernames(collaboratorsRaw);
  const trial = meta.igTrial ?? "";

  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text)]">
        <PlatformBadge platform="instagram" size={13} />
        Instagram options
      </p>

      <div className="divide-y divide-[var(--border)]/70">
        {isReel && (
          <Row label="Music" info={viaFacebook ? "Pick a song or original sound from Instagram. It starts at the beginning of the track. Instagram can't preview a Reel with music, so the preview here plays the track next to your video." : FACEBOOK_WHY}>
            <MusicPicker accountId={accountId} viaFacebook={viaFacebook} meta={meta} onChange={onChange} disabled={disabled} />
          </Row>
        )}

        {!isStory && (
          <Row label="Collaborators" info={`Invite up to ${IG_COLLABORATORS_MAX} accounts. The post shows on their profiles too once they accept.`}>
            <div className="relative">
              <AtSign size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
              <Input
                id="ig-collaborators"
                aria-label="Collaborators"
                className="pl-8"
                disabled={disabled}
                placeholder="Enter an Instagram username"
                value={collaboratorsRaw}
                onChange={(e) => onChange({ igCollaborators: e.target.value.slice(0, 200) })}
                aria-invalid={badCollabs.length > 0 || undefined}
              />
            </div>
          </Row>
        )}

        {!isStory && (
          <Row label="Location" info={viaFacebook ? "Tag a place that has a Facebook Page." : FACEBOOK_WHY}>
            <LocationPicker accountId={accountId} viaFacebook={viaFacebook} meta={meta} onChange={onChange} disabled={disabled} />
          </Row>
        )}

        {isReel && (
          <Row label="Trial reel" info="Show this Reel to people who don't follow you yet. Needs an account with enough followers.">
            <div role="radiogroup" aria-label="Trial reel" className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              {[
                ["", "Off", ""],
                ["auto", "Auto", "Instagram shares it with your followers on its own if it does well."],
                ["manual", "Manual", "You choose in the Instagram app when to share it with your followers."],
              ].map(([value, label, help]) => (
                <label key={value} title={help || undefined} className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-[var(--text)]">
                  <input
                    type="radio"
                    name="ig-trial"
                    value={value}
                    checked={trial === value}
                    disabled={disabled}
                    onChange={() => onChange({ igTrial: value })}
                    className="accent-[var(--primary)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Row>
        )}

        {isReel && (
          <Row label="Share to feed" info="Also show this Reel on your profile grid and in the feed.">
            <div className="pt-0.5">
              <Switch srLabel="Share to feed" disabled={disabled} checked={meta.igShareToFeed !== "0"} onCheckedChange={(v) => onChange({ igShareToFeed: v ? "1" : "0" })} />
            </div>
          </Row>
        )}

        <Row label="AI-generated" info="Adds Instagram's “AI info” label to the post.">
          <div className="pt-0.5">
            <Switch srLabel="AI-generated" disabled={disabled} checked={meta.igAi === "1"} onCheckedChange={(v) => onChange({ igAi: v ? "1" : "" })} />
          </div>
        </Row>
      </div>

      {isStory && <p className="pt-1 text-[12px] text-[var(--text-subtle)]">Stories can&apos;t have music, collaborators or stickers when published automatically.</p>}

      {(notes.length > 0 || badCollabs.length > 0) && (
        <ul role="status" className="mt-1 space-y-0.5 text-[12px] text-[var(--text-muted)]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MusicPicker({ accountId, viaFacebook, meta, onChange, disabled }: { accountId?: string; viaFacebook: boolean; meta: Record<string, string>; onChange: (u: Record<string, string>) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [tracks, setTracks] = React.useState<MusicChoice[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (!open || !accountId) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchInstagramMusicAction(accountId, query).then((res) => {
        if (!live) return;
        setLoading(false);
        if (res.ok && res.data) {
          setTracks(res.data.tracks);
          setError(null);
        } else {
          setTracks(null);
          setError(res.error ?? "Couldn't search music right now.");
        }
      });
    }, query ? 400 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, query, accountId]);

  React.useEffect(() => () => audioRef.current?.pause(), []);

  function togglePreview(t: MusicChoice) {
    if (!t.previewUrl) return;
    if (playing === t.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    setPreviewFailed(null);
    const a = new Audio(t.previewUrl);
    a.onended = () => setPlaying(null);
    a.onerror = () => {
      setPlaying(null);
      setPreviewFailed(t.id);
    };
    audioRef.current = a;
    setPlaying(t.id);
    a.play().catch(() => {
      setPlaying(null);
      setPreviewFailed(t.id);
    });
  }

  if (!viaFacebook) return <NeedsFacebook />;

  const chosen = meta.igMusicId ? { title: meta.igMusicTitle ?? "Selected track", artist: meta.igMusicArtist ?? "", cover: meta.igMusicCover ?? "" } : null;
  const music = Number(meta.igMusicVolume ?? IG_VOLUME_MAX);
  const video = Number(meta.igVideoVolume ?? IG_VOLUME_MAX);

  return (
    <div>
      {chosen ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="flex items-center gap-2.5">
            <TrackArt cover={chosen.cover} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--text)]">{chosen.title}</p>
              <p className="truncate text-[12px] text-[var(--text-subtle)]">{chosen.artist}</p>
            </div>
            <Button size="icon" variant="ghost" type="button" aria-label="Remove music" disabled={disabled} onClick={() => onChange({ igMusicId: "", igMusicTitle: "", igMusicArtist: "", igMusicCover: "", igMusicPreview: "" })}>
              <X size={14} />
            </Button>
          </div>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[12px] text-[var(--text-muted)]">Adjust volume</summary>
            <div className="mt-1.5 space-y-1.5">
              <Volume label="Music" value={music} disabled={disabled} onChange={(v) => onChange({ igMusicVolume: String(v) })} />
              <Volume label="Video sound" value={video} disabled={disabled} onChange={(v) => onChange({ igVideoVolume: String(v) })} />
            </div>
          </details>
        </div>
      ) : (
        <Button size="sm" variant="secondary" type="button" disabled={disabled || !accountId} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Music size={14} /> {open ? "Close" : "Add music"}
        </Button>
      )}

      {open && !chosen && (
        <div className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input aria-label="Search for music" className="pl-8" placeholder="Search for music" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {loading && <p className="px-1 text-[12px] text-[var(--text-subtle)]">Searching…</p>}
          {error && <p role="status" className="px-1 text-[12px] text-[var(--danger)]">{error}</p>}
          {!loading && !error && tracks && tracks.length === 0 && <p className="px-1 text-[12px] text-[var(--text-subtle)]">No tracks found. Results are limited and may differ from Instagram.</p>}
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {tracks?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] p-1 hover:bg-[var(--surface-hover)]">
                <button type="button" title={t.previewUrl ? undefined : "No preview available for this track"} aria-label={playing === t.id ? `Pause ${t.title}` : t.previewUrl ? `Preview ${t.title}` : `No preview available for ${t.title}`} disabled={!t.previewUrl} onClick={() => togglePreview(t)} className="relative shrink-0 disabled:opacity-60">
                  <TrackArt cover={t.cover} />
                  {t.previewUrl && <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35 text-white">{playing === t.id ? <Pause size={14} /> : <Play size={14} />}</span>}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    audioRef.current?.pause();
                    setPlaying(null);
                    onChange({ igMusicId: t.id, igMusicTitle: t.title, igMusicArtist: t.artist, igMusicCover: t.cover, igMusicPreview: t.previewUrl, igMusicVolume: "100", igVideoVolume: meta.igVideoVolume ?? "100" });
                    setOpen(false);
                  }}
                >
                  <span className="block truncate text-[13px] font-medium text-[var(--text)]">{t.title}</span>
                  <span className="block truncate text-[12px] text-[var(--text-subtle)]">{[MINUTES(t.durationMs), t.artist].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
          {previewFailed && <p role="status" className="px-1 text-[12px] text-[var(--text-muted)]">This preview couldn&apos;t be played. You can still pick the track.</p>}
          <p className="px-1 text-[11.5px] text-[var(--text-subtle)]">Results are limited and may differ from Instagram.</p>
        </div>
      )}
    </div>
  );
}

function TrackArt({ cover }: { cover: string }) {
  const [failed, setFailed] = React.useState(false);
  return cover && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote album art from Instagram's CDN, not worth a loader config
    <img src={cover} alt="" width={40} height={40} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-10 w-10 rounded-[var(--radius-sm)] object-cover" />
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
      <Music size={16} />
    </span>
  );
}

function Volume({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const v = Number.isFinite(value) ? Math.min(IG_VOLUME_MAX, Math.max(IG_VOLUME_MIN, value)) : IG_VOLUME_MAX;
  return (
    <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={IG_VOLUME_MIN} max={IG_VOLUME_MAX} value={v} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--primary)]" />
      <span className="w-8 text-right tabular-nums">{v}</span>
    </label>
  );
}

function LocationPicker({ accountId, viaFacebook, meta, onChange, disabled }: { accountId?: string; viaFacebook: boolean; meta: Record<string, string>; onChange: (u: Record<string, string>) => void; disabled?: boolean }) {
  const [query, setQuery] = React.useState("");
  const [places, setPlaces] = React.useState<LocationChoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!accountId || !viaFacebook || query.trim().length < 2) {
      setPlaces([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchInstagramLocationsAction(accountId, query).then((res) => {
        if (!live) return;
        setLoading(false);
        if (res.ok && res.data) {
          setPlaces(res.data.places);
          setError(null);
        } else {
          setPlaces([]);
          setError(res.error ?? "Couldn't search locations right now.");
        }
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, accountId, viaFacebook]);

  if (!viaFacebook) return <NeedsFacebook />;

  if (meta.igLocationId) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
        <MapPin size={14} className="shrink-0 text-[var(--text-subtle)]" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{meta.igLocationName || `Page ${meta.igLocationId}`}</span>
        <Button size="icon" variant="ghost" type="button" aria-label="Remove location" disabled={disabled} onClick={() => onChange({ igLocationId: "", igLocationName: "" })}>
          <X size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <MapPin size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
        <Input aria-label="Search for a location" className="pl-8" disabled={disabled || !accountId} placeholder="Type the location" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {loading && <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Searching…</p>}
      {error && <p role="status" className="mt-1 text-[12px] text-[var(--danger)]">{error}</p>}
      {places.length > 0 && (
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1">
          {places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                onClick={() => {
                  onChange({ igLocationId: p.id, igLocationName: p.place ? `${p.name} · ${p.place}` : p.name });
                  setQuery("");
                  setPlaces([]);
                }}
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--text-subtle)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-[var(--text)]">{p.name}</span>
                  {p.place && <span className="block truncate text-[12px] text-[var(--text-subtle)]">{p.place}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
