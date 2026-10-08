import Link from "next/link";
import {
  AlarmClock, AppWindow, ArrowRight, Check, Clock, Copy, FileText, Hash, Image as ImageIcon, Mail, MessageCircle, StickyNote, Table2, X,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

/**
 * "Before / after" band for the landing page: what running social looks like with ten
 * disconnected tools, and what the same week looks like in one workspace. Everything
 * below the pills is a claim about the product, so each "new way" line maps to a real,
 * shipped capability (composer previews, weekly queue slots, approvals + client portal,
 * unified inbox, reports and exports).
 *
 * Motion: two tilted marquee rows of "pain" pills drifting in opposite directions, a
 * slow wave along the top and bottom edges, drifting light, and a gentle bob on the
 * old-way cards. All CSS; reduced-motion stops it and wraps the pills into a static grid.
 */

const PILLS: { icon: LucideIcon; label: string }[] = [
  { icon: Table2, label: "Spreadsheet calendars" },
  { icon: MessageCircle, label: "Approvals on WhatsApp" },
  { icon: Copy, label: "Copy-pasted captions" },
  { icon: AppWindow, label: "Ten login tabs" },
  { icon: FileText, label: "Hand-built reports" },
  { icon: AlarmClock, label: "Missed schedules" },
  { icon: StickyNote, label: "Sticky notes" },
  { icon: Mail, label: "Email chains" },
  { icon: ImageIcon, label: "Screenshots for sign-off" },
  { icon: Clock, label: "Guessing the best time" },
  { icon: Hash, label: "Forgotten hashtags" },
];

const OLD_WAY = [
  "Captions rewritten by hand for every network",
  "A content calendar that lives in a spreadsheet",
  "Approvals chased over WhatsApp and email",
  "Best posting times guessed, not measured",
  "Monthly reports pasted together by hand",
];

const NEW_WAY = [
  "Write once, then tune a version per network with live previews and character limits",
  "A weekly queue with fixed slots per channel, set from your own engagement data",
  "Approvals and a client review portal, so nothing publishes unseen",
  "One inbox for comments and messages, with AI-drafted replies",
  "Reports and exports from real publish data, no spreadsheets",
];

function PillRow({ reverse = false, offset = false }: { reverse?: boolean; offset?: boolean }) {
  // Rendered twice and slid by exactly half so the loop never jumps; the second copy is hidden from assistive tech.
  const items = [...PILLS, ...PILLS];
  return (
    <div className={`mps-pain__row ${reverse ? "mps-pain__row--reverse" : ""}`} aria-hidden={false}>
      <div className={`mps-pain__track ${offset ? "mps-pain__track--offset" : ""}`}>
        {items.map((p, i) => (
          <span key={i} aria-hidden={i >= PILLS.length || undefined} className="mps-pain__pill">
            <p.icon size={15} aria-hidden />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Wave({ position }: { position: "top" | "bottom" }) {
  const path = "M0 40 C 180 0 360 80 540 40 S 900 0 1080 40 S 1260 80 1440 40 V 80 H 0 Z";
  return (
    <div aria-hidden className={`mps-pain__wave mps-pain__wave--${position}`}>
      <svg viewBox="0 0 2880 80" preserveAspectRatio="none" className="mps-pain__wave-svg" fill="currentColor">
        <path d={path} />
        <path d={path} transform="translate(1440 0)" />
      </svg>
    </div>
  );
}

export function PainSolution() {
  return (
    <section aria-labelledby="pain-title" className="mps-pain relative isolate overflow-hidden text-white">
      <div aria-hidden className="mps-pain__bg" />
      <div aria-hidden className="mps-pain__orb mps-pain__orb--a" />
      <div aria-hidden className="mps-pain__orb mps-pain__orb--b" />
      <Wave position="top" />
      <Wave position="bottom" />

      {/* Marquee: tilted rows of the tools and habits this replaces. */}
      <div className="mps-pain__marquee" role="presentation">
        <PillRow />
        <PillRow reverse offset />
      </div>

      <div className="mps-pain__body relative mx-auto grid max-w-6xl gap-12 px-5 pb-24 lg:grid-cols-[1.05fr_1fr_1fr] lg:gap-10 lg:pb-28">
        <Reveal>
          <p className="inline-flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.16em] text-white/90">
            <span aria-hidden className="h-2 w-2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]" />
            One workspace instead of ten tabs
          </p>
          <h2 id="pain-title" className="mt-5 text-[40px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[54px]">
            Social media is hard enough. Your tools shouldn&apos;t make it{" "}
            <em className="font-medium">harder</em>
            <span aria-hidden>.</span>
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/90">
            Most teams run their social presence across a dozen disconnected tools. Here&apos;s what changes the day you switch.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="mps-pain__cta inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-[#2a1203]">
              Start free <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/features" className="inline-flex items-center rounded-full border border-white/40 px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/15">
              See every feature
            </Link>
          </div>
        </Reveal>

        <div>
          <p className="flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white/90">
            <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <X size={12} strokeWidth={3} />
            </span>
            The old way
          </p>
          <Stagger className="mt-5 space-y-3">
            {OLD_WAY.map((t, i) => (
              <StaggerItem key={t}>
                <div className={`mps-pain__old ${i % 2 === 1 ? "lg:ml-6" : ""}`} style={{ animationDelay: `${i * 0.7}s` }}>
                  <X size={13} aria-hidden className="mt-1 shrink-0 text-white/70" />
                  <span>{t}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div>
          <p className="flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white/90">
            <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <Check size={12} strokeWidth={3} />
            </span>
            The MultiPost way
          </p>
          <Reveal delay={0.1} className="mt-5">
            <div className="mps-pain__new">
            <ul className="divide-y divide-[#f1e4da]">
              {NEW_WAY.map((t) => (
                <li key={t} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
                  <Check size={15} strokeWidth={3} aria-hidden className="mt-1 shrink-0 text-[#e0560f]" />
                  <span className="text-[15px] leading-snug text-[#2a1a12]">{t}</span>
                </li>
              ))}
            </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
