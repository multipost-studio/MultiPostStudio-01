"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import { connectAccountAction, reconnectAccountAction, disconnectAccountAction } from "@/app/actions/integrations";

export function ConnectAccount() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plug size={15} /> Connect account
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connect a social account"
        description="In production this opens the platform's OAuth screen. For this demo, enter a handle."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="connect" loading={pending}>Connect</Button>
          </>
        }
      >
        <form
          id="connect"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await connectAccountAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? res.message ?? "Connected" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Platform">
            <Select name="platform" defaultValue="instagram">
              {PLATFORM_KEYS.map((p) => (
                <option key={p} value={p}>{PLATFORMS[p].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Account handle">
            <Input name="handle" required placeholder="@yourbrand" />
          </Field>
        </form>
      </Modal>
    </>
  );
}

export function AccountActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(label);
    const res = await fn();
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Done" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "connected" && (
        <Button size="sm" variant="secondary" loading={busy === "re"} onClick={() => run("re", () => reconnectAccountAction(id))}>
          Reconnect
        </Button>
      )}
      <Button size="sm" variant="ghost" loading={busy === "dis"} onClick={() => run("dis", () => disconnectAccountAction(id))}>
        Disconnect
      </Button>
    </div>
  );
}
