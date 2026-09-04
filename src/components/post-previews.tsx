"use client";

import * as React from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, ThumbsUp, MoreHorizontal,
  Play, ChevronLeft, ChevronRight, Volume2, Share2,
} from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { contentSpec } from "@/lib/social/capabilities";
import { splitThread } from "@/lib/social/capabilities";
import { cn } from "@/lib/utils";

type Media = { url: string; fullUrl?: string; kind: string; width?: number | null; height?: number | null };

type Props = {
  platform: string;
  contentType: string;
  name?: string;
  handle: string;
  body: string;
  media: Media[];
};

/* ---------------- shared bits ---------------- */

function ratioOf(m: Media | undefined, fallback: string): string {
  if (m?.width && m?.height) return `${m.width} / ${m.height}`;
  const [w, h] = fallback.split(":");
  return `${w} / ${h}`;
}

function isVideo(m: Media | undefined) {
  return m?.kind === "video";
}

/** A single media pane with correct crop + video/carousel affordances. */
function MediaPane({
  media,
  aspect,
  rounded = true,
}: {
  media: Media[];
  aspect: string;
  rounded?: boolean;
}) {
  const [rawI, setI] = React.useState(0);
  if (media.length === 0) return null;
  const i = Math.min(rawI, media.length - 1);
  const m = media[i];

  return (
    <div
      className={cn("relative w-full overflow-hidden bg-black", rounded && "rounded-[var(--radius-md)]")}
      style={{ aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.url} alt="" className="h-full w-full object-cover" />
      {isVideo(m) && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white">
            <Play size={18} className="translate-x-[1px]" fill="currentColor" />
          </span>
        </span>
      )}
      {media.length > 1 && (
        <>
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {i + 1}/{media.length}
          </span>
          <button
            onClick={() => setI((v) => Math.max(0, v - 1))}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white disabled:opacity-0"
            disabled={i === 0}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setI((v) => Math.min(media.length - 1, v + 1))}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white disabled:opacity-0"
            disabled={i === media.length - 1}
          >
            <ChevronRight size={16} />
          </button>
          <span className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {media.map((_, d) => (
              <span key={d} className={cn("h-1 w-1 rounded-full", d === i ? "bg-white" : "bg-white/40")} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function Caption({ body, empty = "Your caption preview appears here…" }: { body: string; empty?: string }) {
  if (!body) return <p className="text-[13px] italic text-[var(--text-subtle)]">{empty}</p>;
  const parts = body.split(/(#[\p{L}0-9_]+|@[\p{L}0-9_.]+)/gu);
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--text)]">
      {parts.map((t, i) =>
        /^[#@]/.test(t) ? (
          <span key={i} className="text-[var(--info)]">{t}</span>
        ) : (
          <React.Fragment key={i}>{t}</React.Fragment>
        ),
      )}
    </p>
  );
}

function Header({ name, handle, sub }: { name?: string; handle: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name ?? handle} size={30} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13.5px] font-semibold text-[var(--text)]">{name ?? handle}</p>
        <p className="truncate text-[11.5px] text-[var(--text-subtle)]">{sub ?? `${handle} · Just now`}</p>
      </div>
      <MoreHorizontal size={16} className="text-[var(--text-subtle)]" />
    </div>
  );
}

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]", className)}>
    {children}
  </div>
);

/** 9:16 phone-style frame for Reels / Stories / Shorts / TikTok. */
function VerticalFrame({
  platform,
  name,
  handle,
  body,
  media,
  story,
}: {
  platform: string;
  name?: string;
  handle: string;
  body: string;
  media: Media[];
  story?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[248px]">
      <div className="relative overflow-hidden rounded-[22px] border-2 border-[var(--border-strong)] bg-black" style={{ aspectRatio: "9 / 16" }}>
        {media[0] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media[0].url} alt="" className="h-full w-full object-cover" />
            {isVideo(media[0]) && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-black/40 text-white">
                  <Play size={20} fill="currentColor" className="translate-x-[1px]" />
                </span>
              </span>
            )}
          </>
        ) : (
          <div className="grid h-full w-full place-items-center text-[12px] text-white/60">
            {story ? "Story" : "Vertical"} media (9:16)
          </div>
        )}

        {story && (
          <div className="absolute inset-x-2 top-2 flex gap-1">
            {[0, 1, 2].map((s) => (
              <span key={s} className={cn("h-0.5 flex-1 rounded-full", s === 0 ? "bg-white" : "bg-white/40")} />
            ))}
          </div>
        )}

        <div className="absolute inset-x-2 top-0 flex items-center gap-2 pt-4 text-white [text-shadow:_0_1px_3px_rgb(0_0_0/60%)]">
          <Avatar name={name ?? handle} size={22} />
          <span className="text-[11px] font-semibold">{handle}</span>
          {!story && <PlatformBadge platform={platform} size={13} />}
        </div>

        {!story && (
          <>
            <div className="absolute bottom-3 left-2 right-10 text-white [text-shadow:_0_1px_3px_rgb(0_0_0/70%)]">
              <p className="line-clamp-3 whitespace-pre-wrap text-[11.5px] leading-snug">
                {body || "Caption / audio appears here…"}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-80">
                <Volume2 size={11} /> Original audio
              </span>
            </div>
            <div className="absolute bottom-3 right-1.5 flex flex-col items-center gap-3 text-white [filter:drop-shadow(0_1px_2px_rgb(0_0_0/60%))]">
              <Heart size={18} />
              <MessageCircle size={18} />
              <Send size={18} />
              <Bookmark size={16} />
            </div>
          </>
        )}
        {story && body && (
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded bg-black/35 p-2 text-center text-[12px] font-semibold text-white">
            {body.slice(0, 120)}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-[var(--text-subtle)]">
        {story ? "Story" : "Vertical"} preview · 9:16
      </p>
    </div>
  );
}

/* ---------------- platform layouts ---------------- */

function InstagramPreview({ contentType, name, handle, body, media }: Omit<Props, "platform">) {
  if (contentType === "reel") return <VerticalFrame platform="instagram" name={name} handle={handle} body={body} media={media} />;
  if (contentType === "story") return <VerticalFrame platform="instagram" name={name} handle={handle} body={body} media={media} story />;

  const aspect = ratioOf(media[0], contentType === "carousel" ? "1:1" : "4:5");
  return (
    <Card>
      <div className="px-3 py-2.5"><Header name={handle} handle={handle} sub="Just now" /></div>
      {media.length > 0 ? <MediaPane media={media} aspect={aspect} rounded={false} /> : (
        <div className="grid aspect-square place-items-center border-y border-[var(--border)] text-[12px] text-[var(--text-subtle)]">
          Instagram needs an image or video
        </div>
      )}
      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center gap-4 text-[var(--text)]">
          <Heart size={19} /><MessageCircle size={19} /><Send size={19} />
          <Bookmark size={19} className="ml-auto" />
        </div>
        <p className="text-[13px]"><span className="font-semibold text-[var(--text)]">{handle}</span> </p>
        <Caption body={body} />
      </div>
    </Card>
  );
}

function FacebookPreview({ contentType, name, handle, body, media }: Omit<Props, "platform">) {
  if (contentType === "reel") return <VerticalFrame platform="facebook" name={name} handle={handle} body={body} media={media} />;
  if (contentType === "story") return <VerticalFrame platform="facebook" name={name} handle={handle} body={body} media={media} story />;

  return (
    <Card>
      <div className="px-3 py-2.5"><Header name={name ?? handle} handle={handle} sub={`${handle} · Just now · 🌐`} /></div>
      {body && <div className="px-3 pb-2"><Caption body={body} /></div>}
      {media.length > 0 && <MediaPane media={media} aspect={ratioOf(media[0], "1.91:1")} rounded={false} />}
      <div className="flex items-center justify-around border-t border-[var(--border)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5"><ThumbsUp size={15} /> Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle size={15} /> Comment</span>
        <span className="flex items-center gap-1.5"><Share2 size={15} /> Share</span>
      </div>
    </Card>
  );
}

function YouTubePreview({ contentType, name, handle, body, media }: Omit<Props, "platform">) {
  if (contentType === "short") return <VerticalFrame platform="youtube" name={name} handle={handle} body={body} media={media} />;

  const title = (body.split("\n").map((l) => l.trim()).find(Boolean) ?? "Untitled video").slice(0, 100);
  return (
    <Card>
      <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: ratioOf(media[0], "16:9") }}>
        {media[0] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media[0].url} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ff0000] text-white">
                <Play size={20} fill="currentColor" className="translate-x-[1px]" />
              </span>
            </span>
          </>
        ) : (
          <div className="grid h-full w-full place-items-center text-[12px] text-white/60">YouTube needs a video</div>
        )}
      </div>
      <div className="flex gap-2.5 px-3 py-2.5">
        <Avatar name={name ?? handle} size={34} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-semibold text-[var(--text)]">{title}</p>
          <p className="text-[12px] text-[var(--text-subtle)]">{name ?? handle}</p>
          <p className="text-[12px] text-[var(--text-subtle)]">No views · Just now</p>
        </div>
      </div>
    </Card>
  );
}

function LinkedInPreview({ name, handle, body, media }: Omit<Props, "platform" | "contentType">) {
  return (
    <Card>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Avatar name={name ?? handle} size={34} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13.5px] font-semibold text-[var(--text)]">{name ?? handle}</p>
            <p className="truncate text-[11.5px] text-[var(--text-subtle)]">Just now · 🌐</p>
          </div>
          <MoreHorizontal size={16} className="text-[var(--text-subtle)]" />
        </div>
      </div>
      {body && <div className="px-3 pb-2"><Caption body={body} /></div>}
      {media.length > 0 && <MediaPane media={media} aspect={ratioOf(media[0], "1.91:1")} rounded={false} />}
      <div className="flex items-center justify-around border-t border-[var(--border)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5"><ThumbsUp size={15} /> Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle size={15} /> Comment</span>
        <span className="flex items-center gap-1.5"><Repeat2 size={15} /> Repost</span>
        <span className="flex items-center gap-1.5"><Send size={15} /> Send</span>
      </div>
    </Card>
  );
}

function Tweet({ name, handle, body, media, thread }: { name?: string; handle: string; body: string; media: Media[]; thread?: boolean }) {
  return (
    <div className={cn("flex gap-2.5 px-3 py-2.5", thread && "border-b border-[var(--border)]")}>
      <Avatar name={name ?? handle} size={34} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          <span className="font-semibold text-[var(--text)]">{name ?? handle}</span>{" "}
          <span className="text-[var(--text-subtle)]">{handle} · now</span>
        </p>
        <Caption body={body} empty="Your post text appears here…" />
        {media.length > 0 && <div className="mt-2"><MediaPane media={media} aspect={ratioOf(media[0], "16:9")} /></div>}
        <div className="mt-2 flex items-center gap-8 text-[var(--text-subtle)]">
          <MessageCircle size={15} /><Repeat2 size={15} /><Heart size={15} /><Send size={15} />
        </div>
      </div>
    </div>
  );
}

function XPreview({ contentType, name, handle, body, media }: Omit<Props, "platform">) {
  if (contentType === "thread") {
    const parts = splitThread(body);
    const posts = parts.length ? parts : [""];
    return (
      <Card>
        {posts.map((p, i) => (
          <Tweet key={i} name={name} handle={handle} body={p} media={i === 0 ? media : []} thread={i < posts.length - 1} />
        ))}
      </Card>
    );
  }
  return <Card><Tweet name={name} handle={handle} body={body} media={media} /></Card>;
}

function CompactPreview({ name, handle, body, media, limit }: Omit<Props, "contentType" | "platform"> & { limit: number }) {
  return (
    <Card className="p-3">
      <Header name={name ?? handle} handle={handle} />
      <div className="mt-2"><Caption body={body} empty="Your post appears here…" /></div>
      {media.length > 0 && <div className="mt-2"><MediaPane media={media} aspect={ratioOf(media[0], "1.91:1")} /></div>}
      <div className="mt-2.5 flex items-center gap-6 text-[var(--text-subtle)]">
        <Heart size={14} /><MessageCircle size={14} /><Repeat2 size={14} />
        <span className={cn("ml-auto text-[11.5px] tabular-nums", body.length > limit ? "font-medium text-[var(--danger)]" : "")}>
          {body.length}/{limit}
        </span>
      </div>
    </Card>
  );
}

/* ---------------- entry ---------------- */

export function PostPreview({ platform, contentType, name, handle, body, media }: Props) {
  const spec = contentSpec(platform, contentType);
  const limit = spec?.charLimit ?? 5000;

  let inner: React.ReactNode;
  switch (platform) {
    case "instagram": inner = <InstagramPreview contentType={contentType} name={name} handle={handle} body={body} media={media} />; break;
    case "facebook": inner = <FacebookPreview contentType={contentType} name={name} handle={handle} body={body} media={media} />; break;
    case "youtube": inner = <YouTubePreview contentType={contentType} name={name} handle={handle} body={body} media={media} />; break;
    case "linkedin": inner = <LinkedInPreview name={name} handle={handle} body={body} media={media} />; break;
    case "x": inner = <XPreview contentType={contentType} name={name} handle={handle} body={body} media={media} />; break;
    case "tiktok": inner = <VerticalFrame platform="tiktok" name={name} handle={handle} body={body} media={media} />; break;
    default: inner = <CompactPreview name={name} handle={handle} body={body} media={media} limit={limit} />;
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-subtle)]">
        <PlatformBadge platform={platform} size={13} />
        {spec?.label ?? contentType}
      </div>
      {inner}
    </div>
  );
}
