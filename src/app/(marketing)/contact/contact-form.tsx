"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";

export function ContactForm() {
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (sent) {
    return (
      <div className="py-8 text-center">
        <p className="text-[16px] font-semibold text-[var(--text)]">Thanks — message received.</p>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">We reply within one business day.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        // Demo: no backend endpoint — acknowledge locally.
        setTimeout(() => {
          setPending(false);
          setSent(true);
        }, 500);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Work email">
          <Input name="email" type="email" required />
        </Field>
      </div>
      <Field label="Topic">
        <Select name="topic" defaultValue="sales">
          <option value="sales">Sales</option>
          <option value="support">Support</option>
          <option value="press">Press</option>
          <option value="feedback">Feedback</option>
        </Select>
      </Field>
      <Field label="Message">
        <Textarea name="message" required className="min-h-[120px]" />
      </Field>
      <Button type="submit" loading={pending}>
        Send message
      </Button>
    </form>
  );
}
