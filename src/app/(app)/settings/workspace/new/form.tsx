"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { createWorkspaceAction } from "@/app/actions/workspace";

export function NewWorkspaceForm({ industries }: { industries: string[] }) {
  const [state, action, pending] = useActionState(createWorkspaceAction, { ok: false } as { ok: boolean; error?: string });

  return (
    <form action={action} className="space-y-4">
      <Field label="Workspace name">
        <Input name="name" required placeholder="Client B" />
      </Field>
      <Field label="Type">
        <Select name="kind" defaultValue="brand">
          <option value="brand">Brand (your own)</option>
          <option value="client">Client</option>
        </Select>
      </Field>
      <Field label="Client name (if a client workspace)">
        <Input name="clientName" placeholder="Acme Corp" />
      </Field>
      <Field label="Industry">
        <Select name="industry" defaultValue={industries[0]}>
          {industries.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </Select>
      </Field>
      {state.error && <p className="text-[14px] text-[var(--danger)]">{state.error}</p>}
      <Button type="submit" loading={pending}>
        Create workspace
      </Button>
    </form>
  );
}
