"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { FormError } from "@/components/ui/misc";
import { submitContactAction, type ContactState } from "@/app/actions/marketing";
import { Turnstile } from "@/components/Turnstile";

export function ContactForm({ initialTopic, jobSlug }: { initialTopic?: string; jobSlug?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContactAction, { ok: false });
  const topicDefault = ["sales", "support", "press", "feedback"].includes(initialTopic ?? "") ? initialTopic! : "sales";

  if (state.ok) {
    return (
      <div className="py-8 text-center">
        <p className="text-[16px] font-semibold text-[var(--text)]">Thanks — your message is on its way.</p>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">We reply within one business day.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Work email">
          <Input name="email" type="email" required />
        </Field>
      </div>
      <Field label="Topic">
        <Select name="topic" defaultValue={topicDefault}>
          <option value="sales">Sales</option>
          <option value="support">Support</option>
          <option value="press">Press</option>
          <option value="feedback">Feedback</option>
        </Select>
      </Field>
      {jobSlug && <input type="hidden" name="jobSlug" value={jobSlug} />}
      <Field label="Message">
        <Textarea name="message" required className="min-h-[120px]" placeholder={jobSlug ? `Applying for ${jobSlug} — experience, links, why you…` : undefined} />
      </Field>
      <Turnstile />
      <FormError>{state.error}</FormError>
      <Button type="submit" loading={pending}>
        Send message
      </Button>
    </form>
  );
}
