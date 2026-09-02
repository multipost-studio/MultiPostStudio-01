"use client";

import * as React from "react";
import { Sparkles, Copy, Check, Lightbulb, PenLine, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { AI_TONES, PLATFORMS, type PlatformKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  aiGenerateCaptionsAction,
  aiGenerateIdeasAction,
  aiGenerateHooksAction,
  aiRepurposeAction,
  aiBlogToPostsAction,
  aiRewriteAction,
  saveGeneratedIdeaAction,
  saveGeneratedDraftAction,
} from "@/app/actions/ai";

const TABS = [
  { value: "captions", label: "Captions" },
  { value: "ideas", label: "Ideas" },
  { value: "hooks", label: "Hooks" },
  { value: "repurpose", label: "Repurpose" },
  { value: "blog", label: "Blog → Posts" },
  { value: "rewrite", label: "Rewrite" },
];

export function Studio({ platforms, brandVoice }: { platforms: string[]; brandVoice: string | null }) {
  const [tab, setTab] = React.useState("captions");
  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={tab} onValueChange={setTab} />
      {brandVoice && (
        <p className="rounded-[var(--radius-md)] bg-[var(--primary-soft)]/50 px-3 py-2 text-[13px] text-[var(--text-muted)]">
          <span className="font-medium text-[var(--primary)]">Brand voice:</span> {brandVoice}
        </p>
      )}
      {tab === "captions" && <Captions platforms={platforms} />}
      {tab === "ideas" && <Ideas />}
      {tab === "hooks" && <Hooks />}
      {tab === "repurpose" && <Repurpose platforms={platforms} />}
      {tab === "blog" && <BlogToPosts />}
      {tab === "rewrite" && <Rewrite platforms={platforms} />}
    </div>
  );
}

function ResultBlock({ text, onSaveDraft, platform }: { text: string; onSaveDraft?: () => void; platform?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="whitespace-pre-wrap text-[14px] text-[var(--text)]">{text}</p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </Button>
        {onSaveDraft && (
          <Button size="sm" variant="ghost" onClick={onSaveDraft}>
            <PenLine size={13} /> Save as draft{platform ? ` (${PLATFORMS[platform as PlatformKey]?.label})` : ""}
          </Button>
        )}
      </div>
    </div>
  );
}

function Captions({ platforms }: { platforms: string[] }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = React.useState("");
  const [platform, setPlatform] = React.useState<string>(platforms[0]);
  const [tone, setTone] = React.useState<string>("Friendly");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<string[]>([]);

  async function run() {
    setLoading(true);
    const res = await aiGenerateCaptionsAction({ prompt, platform: platform as PlatformKey, tone, count: 3 });
    setLoading(false);
    if (res.ok && res.data) setResults(res.data);
    else toast({ title: "Generation failed", description: res.error, tone: "error" });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <Field label="What's the post about?">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. announcing our spring roast with tasting notes" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {PLATFORMS[p as PlatformKey]?.label ?? p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              {AI_TONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button onClick={run} loading={loading} disabled={!prompt.trim()}>
          <Sparkles size={15} /> Generate captions
        </Button>
        <div className="space-y-2">
          {results.map((r, i) => (
            <ResultBlock
              key={i}
              text={r}
              platform={platform}
              onSaveDraft={async () => {
                await saveGeneratedDraftAction(r, platform as PlatformKey);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Ideas() {
  const { toast } = useToast();
  const [topic, setTopic] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<{ title: string; angle: string }[]>([]);

  async function run() {
    setLoading(true);
    const res = await aiGenerateIdeasAction({ topic, count: 8 });
    setLoading(false);
    if (res.ok && res.data) setResults(res.data);
    else toast({ title: "Generation failed", description: res.error, tone: "error" });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <Field label="Topic or theme">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. home brewing for beginners" />
        </Field>
        <Button onClick={run} loading={loading} disabled={!topic.trim()}>
          <Lightbulb size={15} /> Generate ideas
        </Button>
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">{r.title}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">{r.angle}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await saveGeneratedIdeaAction(r.title, `Angle: ${r.angle}`);
                  toast({ title: res.message ?? "Saved", tone: "success" });
                }}
              >
                Save to Ideas
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Hooks() {
  const { toast } = useToast();
  const [topic, setTopic] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<string[]>([]);

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <Field label="Topic">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. why consistency beats virality" />
        </Field>
        <Button
          loading={loading}
          disabled={!topic.trim()}
          onClick={async () => {
            setLoading(true);
            const res = await aiGenerateHooksAction(topic);
            setLoading(false);
            if (res.ok && res.data) setResults(res.data);
            else toast({ title: "Failed", description: res.error, tone: "error" });
          }}
        >
          <Wand2 size={15} /> Generate hooks
        </Button>
        <div className="space-y-2">
          {results.map((r, i) => (
            <ResultBlock key={i} text={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Repurpose({ platforms }: { platforms: string[] }) {
  const { toast } = useToast();
  const [source, setSource] = React.useState("");
  const [targets, setTargets] = React.useState<string[]>(platforms.slice(0, 3));
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, string>>({});

  const toggle = (p: string) =>
    setTargets((t) => (t.includes(p) ? t.filter((x) => x !== p) : [...t, p]));

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <Field label="Original post">
          <Textarea value={source} onChange={(e) => setSource(e.target.value)} className="min-h-[120px]" placeholder="Paste a post you already have…" />
        </Field>
        <div>
          <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Adapt for</p>
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => toggle(p)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[13px] font-medium",
                  targets.includes(p)
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)]",
                )}
              >
                {PLATFORMS[p as PlatformKey]?.label ?? p}
              </button>
            ))}
          </div>
        </div>
        <Button
          loading={loading}
          disabled={!source.trim() || targets.length === 0}
          onClick={async () => {
            setLoading(true);
            const res = await aiRepurposeAction({ source, targets: targets as PlatformKey[] });
            setLoading(false);
            if (res.ok && res.data) setResults(res.data);
            else toast({ title: "Failed", description: res.error, tone: "error" });
          }}
        >
          <Sparkles size={15} /> Repurpose
        </Button>
        <div className="space-y-3">
          {Object.entries(results).map(([p, text]) => (
            <div key={p}>
              <p className="mb-1 text-[13px] font-semibold text-[var(--text-muted)]">{PLATFORMS[p as PlatformKey]?.label ?? p}</p>
              <ResultBlock text={text} platform={p} onSaveDraft={async () => saveGeneratedDraftAction(text, p as PlatformKey)} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BlogToPosts() {
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<string[]>([]);

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <Field label="Article title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Article body">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[160px]" placeholder="Paste the full article…" />
        </Field>
        <Button
          loading={loading}
          disabled={!body.trim()}
          onClick={async () => {
            setLoading(true);
            const res = await aiBlogToPostsAction({ title, body, count: 5 });
            setLoading(false);
            if (res.ok && res.data) setResults(res.data);
            else toast({ title: "Failed", description: res.error, tone: "error" });
          }}
        >
          <Sparkles size={15} /> Turn into posts
        </Button>
        <div className="space-y-2">
          {results.map((r, i) => (
            <ResultBlock key={i} text={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Rewrite({ platforms }: { platforms: string[] }) {
  const { toast } = useToast();
  const [text, setText] = React.useState("");
  const [tone, setTone] = React.useState("Professional");
  const [out, setOut] = React.useState("");
  const [loading, setLoading] = React.useState<string | null>(null);

  async function run(mode: "shorten" | "expand" | "tone" | "rephrase") {
    setLoading(mode);
    const res = await aiRewriteAction({ text, mode, tone, platform: platforms[0] as PlatformKey });
    setLoading(null);
    if (res.ok && typeof res.data === "string") setOut(res.data);
    else toast({ title: "Failed", description: res.error, tone: "error" });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <Field label="Text">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[120px]" />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Button size="sm" variant="secondary" disabled={!text.trim()} loading={loading === "shorten"} onClick={() => run("shorten")}>
            Shorten
          </Button>
          <Button size="sm" variant="secondary" disabled={!text.trim()} loading={loading === "expand"} onClick={() => run("expand")}>
            Expand
          </Button>
          <Button size="sm" variant="secondary" disabled={!text.trim()} loading={loading === "rephrase"} onClick={() => run("rephrase")}>
            Rephrase
          </Button>
          <div className="flex items-center gap-1.5">
            <Select value={tone} onChange={(e) => setTone(e.target.value)} className="h-8 w-auto">
              {AI_TONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" disabled={!text.trim()} loading={loading === "tone"} onClick={() => run("tone")}>
              Change tone
            </Button>
          </div>
        </div>
        {loading && !out && <Spinner />}
        {out && <ResultBlock text={out} />}
      </CardContent>
    </Card>
  );
}
