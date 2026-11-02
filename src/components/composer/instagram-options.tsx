"use client";

import * as React from "react";
import { MapPin, Music, Pause, Play, Search, X } from "lucide-react";
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
 * Instagram options for one post: collaborators, trial reel, share to feed, the AI-generated label, music and location.
 * They are saved with the post's channel. Music and location only work for accounts connected through Facebook (Meta doesn't
 * offer them on Instagram Login), so those rows explain how to reconnect instead of showing a search that can't succeed.
 */

const MINUTES = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-[var(--text-muted)]">
        {label} {hint && <span className="text-[11px] font-normal text-[var(--text-subtle)]">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

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
  const { valid: collabs, invalid: badCollabs } = splitUsernames(collaboratorsRaw);

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]/60 p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text)]">
        <PlatformBadge platform="instagram" size={13} />
        Instagram options
      </p>

      {!isStory && (
        <Row label="Collaborators" hint={`(up to ${IG_COLLABORATORS_MAX}; the post also appears on their profile)`}>
          <Input
            id="ig-collaborators"
            aria-label="Collaborators"
            disabled={disabled}
            placeholder="@username1, @username2"
            value={collaboratorsRaw}
            onChange={(e) => onChange({ igCollaborators: e.target.value.slice(0, 200) })}
            aria-invalid={badCollabs.length > 0 || undefined}
          />
          <p className="mt-1 text-[11.5px] text-[var(--text-subtle)]">
            {collabs.length > IG_COLLABORATORS_MAX
              ? `Only the first ${IG_COLLABORATORS_MAX} will be invited.`
              : "They get an invitation and the post shows on both profiles once they accept."}
          </p>
        </Row>
      )}

      {isReel && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12.5px] font-medium text-[var(--text)]">Share to feed</p>
              <p className="text-[11.5px] text-[var(--text-subtle)]">Also show this Reel on your profile grid and feed.</p>
            </div>
            <Switch srLabel="Share to feed" disabled={disabled} checked={meta.igShareToFeed !== "0"} onCheckedChange={(v) => onChange({ igShareToFeed: v ? "1" : "0" })} />
          </div>

          <Row label="Trial reel" hint="(shown only to people who don't follow you yet)">
            <div role="radiogroup" aria-label="Trial reel" className="flex flex-wrap gap-1.5">
              {[
                ["", "Off"],
                ["manual", "Manual"],
                ["auto", "Auto"],
              ].map(([value, label]) => {
                const on = (meta.igTrial ?? "") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => onChange({ igTrial: value })}
                    className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors disabled:opacity-60 ${on ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {meta.igTrial && (
              <p className="mt-1 text-[11.5px] text-[var(--text-subtle)]">
                {meta.igTrial === "manual" ? "You choose in the Instagram app when to share it with your followers." : "Instagram shares it with your followers automatically if it performs well."} Needs an account with enough followers.
              </p>
            )}
          </Row>

          <MusicPicker accountId={accountId} viaFacebook={viaFacebook} meta={meta} onChange={onChange} disabled={disabled} />
        </>
      )}

      {!isStory && <LocationPicker accountId={accountId} viaFacebook={viaFacebook} meta={meta} onChange={onChange} disabled={disabled} />}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-medium text-[var(--text)]">AI-generated</p>
          <p className="text-[11.5px] text-[var(--text-subtle)]">Adds Instagram&apos;s “AI info” label to the post.</p>
        </div>
        <Switch srLabel="AI-generated" disabled={disabled} checked={meta.igAi === "1"} onCheckedChange={(v) => onChange({ igAi: v ? "1" : "" })} />
      </div>

      {isStory && <p className="text-[11.5px] text-[var(--text-subtle)]">Stickers, music and collaborators aren&apos;t available for stories published automatically.</p>}

      {(notes.length > 0 || badCollabs.length > 0) && (
        <ul role="status" className="space-y-0.5 text-[12px] text-[var(--warning-text,var(--text-muted))]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NeedsFacebook({ what }: { what: string }) {
  return (
    <p className="rounded-[var(--radius-md)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
      {what} needs this account connected through Facebook. In Integrations, reconnect it with “Connect Instagram through Facebook”.
    </p>
  );
}

function MusicPicker({ accountId, viaFacebook, meta, onChange, disabled }: { accountId?: string; viaFacebook: boolean; meta: Record<string, string>; onChange: (u: Record<string, string>) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [tracks, setTracks] = React.useState<MusicChoice[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [playing, setPlaying] = React.useState<string | null>(null);
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
    const a = new Audio(t.previewUrl);
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    audioRef.current = a;
    setPlaying(t.id);
    a.play().catch(() => setPlaying(null));
  }

  if (!viaFacebook) {
    return (
      <Row label="Music">
        <NeedsFacebook what="Music" />
      </Row>
    );
  }

  const chosen = meta.igMusicId ? { id: meta.igMusicId, title: meta.igMusicTitle ?? "Selected track", artist: meta.igMusicArtist ?? "", cover: meta.igMusicCover ?? "" } : null;
  const music = Number(meta.igMusicVolume ?? IG_VOLUME_MAX);
  const video = Number(meta.igVideoVolume ?? IG_VOLUME_MAX);

  return (
    <Row label="Music" hint="(songs and original sounds from Instagram; starts at the beginning of the track)">
      {chosen ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <div className="flex items-center gap-2.5">
            <TrackArt cover={chosen.cover} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--text)]">{chosen.title}</p>
              <p className="truncate text-[12px] text-[var(--text-subtle)]">{chosen.artist}</p>
            </div>
            <Button size="icon" variant="ghost" type="button" aria-label="Remove music" disabled={disabled} onClick={() => onChange({ igMusicId: "", igMusicTitle: "", igMusicArtist: "", igMusicCover: "" })}>
              <X size={14} />
            </Button>
          </div>
          <Volume label="Music volume" value={music} disabled={disabled} onChange={(v) => onChange({ igMusicVolume: String(v) })} />
          <Volume label="Video volume" value={video} disabled={disabled} onChange={(v) => onChange({ igVideoVolume: String(v) })} />
          <p className="text-[11.5px] text-[var(--text-subtle)]">Instagram can&apos;t preview a Reel with its music. If the track is withdrawn before posting, the Reel won&apos;t publish.</p>
        </div>
      ) : (
        <Button size="sm" variant="secondary" type="button" disabled={disabled || !accountId} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Music size={14} /> {open ? "Close" : "Add music"}
        </Button>
      )}

      {open && !chosen && (
        <div className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input aria-label="Search for music" className="pl-8" placeholder="Search for music" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {loading && <p className="px-1 text-[12px] text-[var(--text-subtle)]">Searching…</p>}
          {error && <p role="status" className="px-1 text-[12px] text-[var(--danger)]">{error}</p>}
          {!loading && !error && tracks && tracks.length === 0 && <p className="px-1 text-[12px] text-[var(--text-subtle)]">No tracks found. Results are limited and may differ from Instagram.</p>}
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {tracks?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] p-1 hover:bg-[var(--surface-hover)]">
                <button type="button" aria-label={playing === t.id ? `Pause ${t.title}` : `Preview ${t.title}`} disabled={!t.previewUrl} onClick={() => togglePreview(t)} className="relative shrink-0 disabled:opacity-60">
                  <TrackArt cover={t.cover} />
                  {t.previewUrl && <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35 text-white">{playing === t.id ? <Pause size={14} /> : <Play size={14} />}</span>}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    audioRef.current?.pause();
                    setPlaying(null);
                    onChange({ igMusicId: t.id, igMusicTitle: t.title, igMusicArtist: t.artist, igMusicCover: t.cover, igMusicVolume: "100", igVideoVolume: meta.igVideoVolume ?? "100" });
                    setOpen(false);
                  }}
                >
                  <span className="block truncate text-[13px] font-medium text-[var(--text)]">{t.title}</span>
                  <span className="block truncate text-[12px] text-[var(--text-subtle)]">
                    {[MINUTES(t.durationMs), t.artist].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-1 text-[11.5px] text-[var(--text-subtle)]">Results are limited and may differ from Instagram.</p>
        </div>
      )}
    </Row>
  );
}

function TrackArt({ cover }: { cover: string }) {
  return cover ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote album art from Instagram's CDN, not worth a loader config
    <img src={cover} alt="" width={40} height={40} className="h-10 w-10 rounded-[var(--radius-sm)] object-cover" />
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
      <span className="w-24 shrink-0">{label}</span>
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

  if (!viaFacebook) {
    return (
      <Row label="Location">
        <NeedsFacebook what="Location" />
      </Row>
    );
  }

  return (
    <Row label="Location" hint="(a place with a Facebook Page)">
      {meta.igLocationId ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
          <MapPin size={14} className="shrink-0 text-[var(--text-subtle)]" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{meta.igLocationName || `Page ${meta.igLocationId}`}</span>
          <Button size="icon" variant="ghost" type="button" aria-label="Remove location" disabled={disabled} onClick={() => onChange({ igLocationId: "", igLocationName: "" })}>
            <X size={14} />
          </Button>
        </div>
      ) : (
        <>
          <Input aria-label="Search for a location" disabled={disabled || !accountId} placeholder="Type a place name" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
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
        </>
      )}
    </Row>
  );
}
