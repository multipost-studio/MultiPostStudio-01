"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { AI_TONES, PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import { freeCaptionAction } from "../actions";

export function CaptionTool() {
  const [state, action, pending] = useActionState(freeCaptionAction, { ok: false, results: [] as string[] } as {
    ok: boolean;
    error?: string;
    results: string[];
  });

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <Field label="What's the post about?">
          <Input name="prompt" required placeholder="Announcing our spring roast with tasting notes" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select name="platform" defaultValue="instagram">
              {PLATFORM_KEYS.map((p) => (
                <option key={p} value={p}>{PLATFORMS[p].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tone">
            <Select name="tone" defaultValue="Friendly">
              {AI_TONES.filter((t) => t !== "Brand voice").map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        {state.error && <p className="text-[14px] text-[var(--danger)]">{state.error}</p>}
        <Button type="submit" loading={pending}>Generate captions</Button>
      </form>

      {state.results.length > 0 && (
        <div className="space-y-2">
          {state.results.map((r, i) => (
            <div key={i} className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[14px] text-[var(--text)]">
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
