"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { freeHashtagAction } from "../actions";

export function HashtagTool() {
  const [state, action, pending] = useActionState(freeHashtagAction, { ok: false, results: [] as string[] } as {
    ok: boolean;
    error?: string;
    results: string[];
  });

  return (
    <div className="space-y-4">
      <form action={action} className="flex gap-2">
        <Field label="" className="flex-1">
          <Input name="topic" required placeholder="home brewing for beginners" />
        </Field>
        <Button type="submit" loading={pending} className="self-end">
          Generate
        </Button>
      </form>
      {state.error && <p className="text-[14px] text-[var(--danger)]">{state.error}</p>}
      {state.results.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.results.map((h) => (
            <span key={h} className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[14px] font-medium text-[var(--primary)]">
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
