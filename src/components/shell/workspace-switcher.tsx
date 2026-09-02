"use client";

import { useTransition } from "react";
import { ChevronsUpDown, Check, Plus, Building2 } from "lucide-react";
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { switchWorkspaceAction } from "@/app/actions/workspace";
import Link from "next/link";

type WS = { id: string; name: string; kind: string; clientName: string | null };

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  orgName,
}: {
  workspaces: WS[];
  activeId: string;
  orgName: string;
}) {
  const [pending, start] = useTransition();
  const active = workspaces.find((w) => w.id === activeId);

  return (
    <Dropdown
      align="start"
      className="w-[264px]"
      trigger={
        <button
          className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
          disabled={pending}
        >
          <Avatar name={active?.name ?? "?"} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-[var(--text)]">
              {active?.name ?? "Select workspace"}
            </span>
            <span className="block truncate text-[12px] text-[var(--text-subtle)]">{orgName}</span>
          </span>
          <ChevronsUpDown size={14} className="text-[var(--text-subtle)]" />
        </button>
      }
    >
      <MenuLabel>{orgName}</MenuLabel>
      {workspaces.map((w) => (
        <MenuItem key={w.id} onClick={() => start(() => switchWorkspaceAction(w.id))}>
          <Avatar name={w.name} size={20} />
          <span className="flex-1 truncate">
            {w.name}
            {w.kind === "client" && (
              <span className="ml-1.5 text-[12px] text-[var(--text-subtle)]">client</span>
            )}
          </span>
          {w.id === activeId && <Check size={14} className="text-[var(--primary)]" />}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem>
        <Link href="/settings/workspace/new" className="flex items-center gap-2">
          <Plus size={14} /> New workspace
        </Link>
      </MenuItem>
      <MenuItem>
        <Link href="/agency" className="flex items-center gap-2">
          <Building2 size={14} /> Agency overview
        </Link>
      </MenuItem>
    </Dropdown>
  );
}
