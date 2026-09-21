"use client";

import * as React from "react";
import {
  Grid3X3, Film, UserSquare2, Copy, Play, Heart, MessageCircle, MoreHorizontal,
} from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Media = {
  url: string;
  fullUrl?: string;
  kind: string;
  width?: number | null;
  height?: number | null;
};

export interface InstagramGridPreviewProps {
  name?: string;
  handle: string;
  media: Media[];
  body?: string;
  contentType?: string;
  theme?: "light" | "dark";
  className?: string;
}

interface MockGridItem {
  id: string;
  imageUrl: string;
  kind: "image" | "carousel" | "reel";
  likes: string;
  comments: string;
}

const MOCK_PAST_POSTS: MockGridItem[] = [
  {
    id: "m1",
    imageUrl:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80",
    kind: "carousel",
    likes: "2.4K",
    comments: "48",
  },
  {
    id: "m2",
    imageUrl:
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=400&auto=format&fit=crop&q=80",
    kind: "reel",
    likes: "5.1K",
    comments: "112",
  },
  {
    id: "m3",
    imageUrl:
      "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&auto=format&fit=crop&q=80",
    kind: "image",
    likes: "1.8K",
    comments: "31",
  },
  {
    id: "m4",
    imageUrl:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&auto=format&fit=crop&q=80",
    kind: "image",
    likes: "3.2K",
    comments: "64",
  },
  {
    id: "m5",
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&auto=format&fit=crop&q=80",
    kind: "carousel",
    likes: "4.7K",
    comments: "93",
  },
  {
    id: "m6",
    imageUrl:
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=80",
    kind: "reel",
    likes: "8.9K",
    comments: "184",
  },
  {
    id: "m7",
    imageUrl:
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&auto=format&fit=crop&q=80",
    kind: "image",
    likes: "1.5K",
    comments: "22",
  },
  {
    id: "m8",
    imageUrl:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=80",
    kind: "image",
    likes: "3.6K",
    comments: "76",
  },
];

const HIGHLIGHTS = [
  { id: "h1", label: "Studio", initial: "🎨" },
  { id: "h2", label: "Updates", initial: "⚡" },
  { id: "h3", label: "Tips", initial: "💡" },
  { id: "h4", label: "Press", initial: "📰" },
];

export function InstagramGridPreview({
  name,
  handle,
  media,
  body,
  contentType,
  theme = "light",
  className,
}: InstagramGridPreviewProps) {
  const isDark = theme === "dark";
  const currentPostMedia = media[0];
  const isCurrentReel = contentType === "reel" || currentPostMedia?.kind === "video";
  const isCurrentCarousel = contentType === "carousel" || media.length > 1;

  const themeClasses = isDark
    ? "bg-black text-neutral-100 border-neutral-800"
    : "bg-white text-neutral-900 border-neutral-200";

  const subtleText = isDark ? "text-neutral-400" : "text-neutral-500";
  const borderCol = isDark ? "border-neutral-800" : "border-neutral-200";
  const btnBg = isDark ? "bg-neutral-900 hover:bg-neutral-800 text-neutral-200" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[420px] overflow-hidden rounded-[var(--radius-lg)] border text-[13px] shadow-sm transition-colors",
        themeClasses,
        className,
      )}
    >
      {/* Profile Bar Header */}
      <div className={cn("flex items-center justify-between border-b px-4 py-2.5", borderCol)}>
        <div className="flex items-center gap-1.5 font-semibold text-[14px]">
          <span>{handle.startsWith("@") ? handle.slice(1) : handle}</span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" title="Active preview" />
        </div>
        <MoreHorizontal size={18} className={subtleText} />
      </div>

      {/* Profile Stats & Avatar */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between gap-4">
          <div className="relative">
            <div className="rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-[2.5px]">
              <div className={cn("rounded-full p-0.5", isDark ? "bg-black" : "bg-white")}>
                <Avatar name={name ?? handle} size={64} />
              </div>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 text-center">
            <div>
              <p className="font-bold text-[15px]">49</p>
              <p className={cn("text-[11px]", subtleText)}>posts</p>
            </div>
            <div>
              <p className="font-bold text-[15px]">12.8K</p>
              <p className={cn("text-[11px]", subtleText)}>followers</p>
            </div>
            <div>
              <p className="font-bold text-[15px]">415</p>
              <p className={cn("text-[11px]", subtleText)}>following</p>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-3 space-y-0.5 text-[12.5px] leading-tight">
          <p className="font-semibold">{name ?? handle}</p>
          <p className={subtleText}>Digital Creator • Social Studio</p>
          <p className="line-clamp-2">
            {body ? body.slice(0, 80) + (body.length > 80 ? "…" : "") : "Crafting pixel-perfect stories ✨"}
          </p>
          <p className="font-medium text-sky-500 hover:underline">multipost.studio/{handle.replace("@", "")}</p>
        </div>

        {/* Action Buttons */}
        <div className="mt-3.5 flex gap-1.5 text-[12px] font-semibold">
          <button type="button" className={cn("flex-1 rounded-[6px] py-1.5 transition-colors", btnBg)}>
            Edit profile
          </button>
          <button type="button" className={cn("flex-1 rounded-[6px] py-1.5 transition-colors", btnBg)}>
            Share profile
          </button>
        </div>

        {/* Story Highlights */}
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
          {HIGHLIGHTS.map((hl) => (
            <div key={hl.id} className="flex flex-col items-center gap-1">
              <div className={cn("grid h-12 w-12 place-items-center rounded-full border text-[16px]", borderCol, btnBg)}>
                {hl.initial}
              </div>
              <span className={cn("text-[10px] tracking-tight", subtleText)}>{hl.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Tab Navigation */}
      <div className={cn("mt-2 flex border-t text-[11px] font-medium", borderCol)}>
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center justify-center gap-1 border-t-2 py-2.5 transition-colors",
            isDark ? "border-white text-white" : "border-neutral-900 text-neutral-900",
          )}
        >
          <Grid3X3 size={15} />
          <span className="hidden sm:inline">POSTS</span>
        </button>
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center justify-center gap-1 border-t-2 border-transparent py-2.5 transition-colors",
            subtleText,
          )}
        >
          <Film size={15} />
          <span className="hidden sm:inline">REELS</span>
        </button>
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center justify-center gap-1 border-t-2 border-transparent py-2.5 transition-colors",
            subtleText,
          )}
        >
          <UserSquare2 size={15} />
          <span className="hidden sm:inline">TAGGED</span>
        </button>
      </div>

      {/* 3×3 Grid */}
      <div className="grid grid-cols-3 gap-0.5 bg-neutral-300 dark:bg-neutral-800">
        {/* Cell 0: The Current Draft Post */}
        <div className="group relative aspect-square overflow-hidden bg-neutral-900">
          {currentPostMedia ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPostMedia.url}
                alt="Current draft post"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              {isCurrentCarousel && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white shadow-xs">
                  <Copy size={12} />
                </span>
              )}
              {isCurrentReel && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white shadow-xs">
                  <Play size={12} fill="currentColor" />
                </span>
              )}
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-white/70">
              <Grid3X3 size={20} className="mb-1 opacity-70" />
              <span className="text-[10px] font-medium leading-tight">Draft Post</span>
            </div>
          )}

          {/* New / Draft Tag */}
          <span className="absolute bottom-1.5 left-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-xs">
            New
          </span>

          {/* Hover Overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex items-center gap-1 text-[11px] font-bold text-white">
              <Heart size={13} fill="currentColor" />
              New
            </span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-white">
              <MessageCircle size={13} fill="currentColor" />
              0
            </span>
          </div>
        </div>

        {/* Cells 1-8: Simulated Previous Posts */}
        {MOCK_PAST_POSTS.map((item) => (
          <div key={item.id} className="group relative aspect-square overflow-hidden bg-neutral-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            {item.kind === "carousel" && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white shadow-xs">
                <Copy size={12} />
              </span>
            )}
            {item.kind === "reel" && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white shadow-xs">
                <Play size={12} fill="currentColor" />
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex items-center gap-1 text-[11px] font-bold text-white">
                <Heart size={13} fill="currentColor" />
                {item.likes}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-white">
                <MessageCircle size={13} fill="currentColor" />
                {item.comments}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className={cn("p-2 text-center text-[10.5px]", subtleText)}>
        3×3 Feed Simulation · Shows how your post integrates into your profile grid
      </p>
    </div>
  );
}
