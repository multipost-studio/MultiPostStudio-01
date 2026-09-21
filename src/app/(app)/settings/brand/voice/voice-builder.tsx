"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Save,
  ArrowLeft,
  Plus,
  X,
  Sliders,
  MessageSquare,
  BookOpen,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { saveBrandPreferencesAction } from "@/app/actions/workspace";
import { synthesizeBrandVoiceAction } from "@/app/actions/ai";
import { cn } from "@/lib/utils";

interface BrandVoiceBuilderProps {
  initialVoice: string;
  initialTones: Record<string, string>;
  initialPreferences: {
    vocabulary?: string[];
    avoidWords?: string[];
    emojiStyle?: string;
    ctaStyle?: string;
    hashtagStrategy?: string;
  };
  sourcesCount: number;
  canManage: boolean;
}

const SUPPORTED_PLATFORMS = [
  { key: "instagram", label: "Instagram", defaultPlaceholder: "Visual, warm, community-first, aspirational" },
  { key: "linkedin", label: "LinkedIn", defaultPlaceholder: "Professional, insightful, thought-leadership, authoritative" },
  { key: "x", label: "X (Twitter)", defaultPlaceholder: "Concise, punchy, conversational, timely" },
  { key: "facebook", label: "Facebook", defaultPlaceholder: "Friendly, community-oriented, relatable, helpful" },
  { key: "tiktok", label: "TikTok", defaultPlaceholder: "Casual, energetic, authentic, hook-driven" },
  { key: "youtube", label: "YouTube", defaultPlaceholder: "Clear, descriptive, engaging, educational" },
] as const;

const EMOJI_OPTIONS = [
  { value: "Minimal & Strategic (1-2 per post)", label: "Minimal & Strategic", desc: "1-2 emojis used sparingly for emphasis" },
  { value: "Expressive & Friendly (3-5 per post)", label: "Expressive & Friendly", desc: "Lively visual accents throughout the post" },
  { value: "None (Zero emojis)", label: "None / Plain Text", desc: "Strictly editorial and clean" },
  { value: "Bullet list accents only", label: "List Accents Only", desc: "Used only as markers for key points" },
];

const CTA_OPTIONS = [
  { value: "Conversational question inviting comments", label: "Conversational Question", desc: "Encourages discussion and replies" },
  { value: "Direct action prompt with link", label: "Direct Action", desc: "Clear command like 'Sign up today' or 'Read more'" },
  { value: "Save & share prompt", label: "Save & Share", desc: "Prompts bookmarking for reference" },
  { value: "Subtle or no CTA", label: "Subtle / Soft", desc: "Lets content speak for itself" },
];

export function BrandVoiceBuilder({
  initialVoice,
  initialTones,
  initialPreferences,
  sourcesCount,
  canManage,
}: BrandVoiceBuilderProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [voice, setVoice] = React.useState(initialVoice || "");
  const [tones, setTones] = React.useState<Record<string, string>>(initialTones || {});
  const [vocabulary, setVocabulary] = React.useState<string[]>(initialPreferences.vocabulary || []);
  const [avoidWords, setAvoidWords] = React.useState<string[]>(initialPreferences.avoidWords || []);
  const [emojiStyle, setEmojiStyle] = React.useState<string>(initialPreferences.emojiStyle || EMOJI_OPTIONS[0].value);
  const [ctaStyle, setCtaStyle] = React.useState<string>(initialPreferences.ctaStyle || CTA_OPTIONS[0].value);
  const [hashtagStrategy, setHashtagStrategy] = React.useState<string>(
    initialPreferences.hashtagStrategy || "3-5 specific, relevant niche hashtags",
  );

  const [activePlatformTab, setActivePlatformTab] = React.useState<string>("instagram");
  const [vocabInput, setVocabInput] = React.useState("");
  const [avoidInput, setAvoidInput] = React.useState("");

  const [saving, setSaving] = React.useState(false);
  const [synthesizing, setSynthesizing] = React.useState(false);

  function addVocabWord() {
    const trimmed = vocabInput.trim();
    if (trimmed && !vocabulary.includes(trimmed)) {
      setVocabulary([...vocabulary, trimmed]);
      setVocabInput("");
    }
  }

  function addAvoidWord() {
    const trimmed = avoidInput.trim();
    if (trimmed && !avoidWords.includes(trimmed)) {
      setAvoidWords([...avoidWords, trimmed]);
      setAvoidInput("");
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await saveBrandPreferencesAction({
      brandVoice: voice,
      brandTones: tones,
      brandPreferences: {
        vocabulary,
        avoidWords,
        emojiStyle,
        ctaStyle,
        hashtagStrategy,
      },
    });
    setSaving(false);

    if (res.ok) {
      toast({ title: "Brand voice profile saved", tone: "success" });
      router.refresh();
    } else {
      toast({ title: "Failed to save", description: res.error, tone: "error" });
    }
  }

  async function handleSynthesize() {
    if (sourcesCount === 0) {
      toast({
        title: "No brand sources found",
        description: "Add at least one document or website in Brand Brain sources first.",
        tone: "error",
      });
      return;
    }

    setSynthesizing(true);
    const res = await synthesizeBrandVoiceAction();
    setSynthesizing(false);

    if (res.ok && res.data) {
      const data = res.data;
      setVoice(data.voiceSummary);
      setTones(data.tones);
      setVocabulary(data.preferences.vocabulary);
      setAvoidWords(data.preferences.avoidWords);
      setEmojiStyle(data.preferences.emojiStyle);
      setCtaStyle(data.preferences.ctaStyle);
      setHashtagStrategy(data.preferences.hashtagStrategy);

      toast({
        title: "Brand voice synthesized",
        description: res.message ?? "Profile generated from your brand sources.",
        tone: "success",
      });
      router.refresh();
    } else {
      toast({
        title: "Synthesis failed",
        description: res.error ?? "Could not synthesize brand voice",
        tone: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/brand"
            className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={14} />
            <span>Brand Brain</span>
          </Link>
          <div>
            <h1 className="text-[18px] font-bold text-[var(--text)]">Brand Voice & Tone Builder</h1>
            <p className="text-[13px] text-[var(--text-subtle)]">
              Fine-tune your brand&apos;s vocabulary, emoji style, and per-platform voice guides.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={synthesizing}
              onClick={handleSynthesize}
              title="Analyze brand sources and generate full voice profile automatically"
              className="gap-1.5"
            >
              <Sparkles size={14} className="text-[var(--primary)]" />
              <span>AI Synthesize</span>
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              onClick={handleSave}
              className="gap-1.5"
            >
              <Save size={14} />
              <span>Save Profile</span>
            </Button>
          </div>
        )}
      </div>

      {/* Section 1: Core Voice Summary */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
        <div className="mb-2 flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--primary)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Core Brand Voice & Personality</h2>
        </div>
        <p className="mb-3 text-[13px] text-[var(--text-muted)]">
          The overarching identity and tone of your brand across all channels.
        </p>
        <Textarea
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          disabled={!canManage}
          placeholder="e.g. Thoughtful, human, authoritative yet approachable. We never use hype or buzzwords. We speak with conviction and clarity."
          className="min-h-[100px] text-[13.5px] leading-relaxed"
        />
      </div>

      {/* Section 2: Per-Platform Tone Adjustments */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
        <div className="mb-2 flex items-center gap-2">
          <Sliders size={16} className="text-[var(--primary)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Per-Platform Tone Overrides</h2>
        </div>
        <p className="mb-3 text-[13px] text-[var(--text-muted)]">
          Social platforms have distinct cultures. Configure specific tone guidelines for each destination.
        </p>

        {/* Platform Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2.5">
          {SUPPORTED_PLATFORMS.map((p) => {
            const hasCustom = Boolean(tones[p.key]);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setActivePlatformTab(p.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  activePlatformTab === p.key
                    ? "bg-[var(--primary-soft)] text-[var(--primary)] font-semibold"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
              >
                <PlatformBadge platform={p.key} size={13} />
                <span>{p.label}</span>
                {hasCustom && <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" title="Configured" />}
              </button>
            );
          })}
        </div>

        {/* Active Platform Editor */}
        {(() => {
          const active = SUPPORTED_PLATFORMS.find((p) => p.key === activePlatformTab)!;
          return (
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center justify-between text-[12px] text-[var(--text-subtle)]">
                <span>Tone for {active.label}:</span>
                {tones[active.key] && (
                  <button
                    type="button"
                    onClick={() => setTones((prev) => {
                      const copy = { ...prev };
                      delete copy[active.key];
                      return copy;
                    })}
                    className="text-[var(--text-subtle)] hover:text-[var(--danger)]"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <Input
                value={tones[active.key] || ""}
                onChange={(e) => setTones({ ...tones, [active.key]: e.target.value })}
                disabled={!canManage}
                placeholder={active.defaultPlaceholder}
                className="text-[13.5px]"
              />
              <p className="text-[11.5px] text-[var(--text-subtle)]">
                Default: <span className="italic">{active.defaultPlaceholder}</span>
              </p>
            </div>
          );
        })()}
      </div>

      {/* Section 3: Vocabulary & Language Control */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Preferred Words */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen size={16} className="text-emerald-500" />
            <h2 className="text-[14.5px] font-semibold text-[var(--text)]">Preferred Vocabulary</h2>
          </div>
          <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">
            Keywords and concepts our AI should prioritize in captions and copy.
          </p>
          {canManage && (
            <div className="mb-2.5 flex gap-1.5">
              <Input
                value={vocabInput}
                onChange={(e) => setVocabInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addVocabWord();
                  }
                }}
                placeholder="Add word (press Enter)…"
                className="text-[12.5px]"
              />
              <Button size="sm" variant="secondary" onClick={addVocabWord}>
                <Plus size={13} />
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {vocabulary.length === 0 && (
              <span className="text-[12px] italic text-[var(--text-subtle)]">No preferred words added yet.</span>
            )}
            {vocabulary.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400"
              >
                {w}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setVocabulary(vocabulary.filter((x) => x !== w))}
                    className="rounded-full hover:text-emerald-800"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Avoid Words */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="mb-2 flex items-center gap-2">
            <X size={16} className="text-rose-500" />
            <h2 className="text-[14.5px] font-semibold text-[var(--text)]">Words to Avoid (Banned)</h2>
          </div>
          <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">
            Jargon, cliches, or phrases the AI must strictly never use.
          </p>
          {canManage && (
            <div className="mb-2.5 flex gap-1.5">
              <Input
                value={avoidInput}
                onChange={(e) => setAvoidInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAvoidWord();
                  }
                }}
                placeholder="Add banned term (press Enter)…"
                className="text-[12.5px]"
              />
              <Button size="sm" variant="secondary" onClick={addAvoidWord}>
                <Plus size={13} />
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {avoidWords.length === 0 && (
              <span className="text-[12px] italic text-[var(--text-subtle)]">No banned words added yet.</span>
            )}
            {avoidWords.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[12px] font-medium text-rose-600 dark:text-rose-400"
              >
                {w}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setAvoidWords(avoidWords.filter((x) => x !== w))}
                    className="rounded-full hover:text-rose-800"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Formatting, Emoji, and CTA Preferences */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
        <div className="mb-2 flex items-center gap-2">
          <Hash size={16} className="text-[var(--primary)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Style, Emojis & Call-to-Actions</h2>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Emoji Style">
            <div className="grid gap-2">
              {EMOJI_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border p-2.5 transition-colors",
                    emojiStyle === opt.value
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/30"
                      : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  <input
                    type="radio"
                    name="emojiStyle"
                    value={opt.value}
                    checked={emojiStyle === opt.value}
                    onChange={(e) => setEmojiStyle(e.target.value)}
                    disabled={!canManage}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text)]">{opt.label}</p>
                    <p className="text-[11.5px] text-[var(--text-subtle)]">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Call-to-Action (CTA) Strategy">
            <div className="grid gap-2">
              {CTA_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border p-2.5 transition-colors",
                    ctaStyle === opt.value
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/30"
                      : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  <input
                    type="radio"
                    name="ctaStyle"
                    value={opt.value}
                    checked={ctaStyle === opt.value}
                    onChange={(e) => setCtaStyle(e.target.value)}
                    disabled={!canManage}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text)]">{opt.label}</p>
                    <p className="text-[11.5px] text-[var(--text-subtle)]">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <Field label="Hashtag Guidelines">
            <Input
              value={hashtagStrategy}
              onChange={(e) => setHashtagStrategy(e.target.value)}
              disabled={!canManage}
              placeholder="e.g. 3-5 specific niche hashtags at the end of post"
              className="text-[13px]"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
