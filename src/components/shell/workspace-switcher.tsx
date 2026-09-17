"use client";

import { useState, useTransition } from "react";
import { ChevronsUpDown, Check, Plus, Building2, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const active = workspaces.find((w) => w.id === activeId);
  // Search appears past a handful of workspaces — agency users with dozens
  // of client workspaces can't scan a flat list.
  const showSearch = workspaces.length > 6;
  const visible = showSearch
    ? workspaces.filter((w) => `${w.name} ${w.clientName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : workspaces;

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
      {showSearch && (
        <div className="flex items-center gap-2 px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
          <Search size={14} aria-hidden className="shrink-0 text-[var(--text-subtle)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspaces…"
            aria-label="Search workspaces"
            className="w-full bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>
      )}
      {visible.map((w) => (
        <MenuItem
          key={w.id}
          aria-current={w.id === activeId ? "true" : undefined}
          onClick={() => start(() => switchWorkspaceAction(w.id))}
        >
          <Avatar name={w.name} size={20} />
          <span className="flex-1 truncate">
            {w.name}
            {w.kind === "client" && (
              <span className="ml-1.5 text-[12px] text-[var(--text-subtle)]">client</span>
            )}
            {w.clientName && w.kind !== "client" && (
              <span className="ml-1.5 text-[12px] text-[var(--text-subtle)]">{w.clientName}</span>
            )}
          </span>
          {w.id === activeId && <Check size={14} className="text-[var(--primary)]" />}
        </MenuItem>
      ))}
      {showSearch && visible.length === 0 && (
        <p className="px-2.5 py-2 text-[13px] text-[var(--text-subtle)]">No workspaces match “{query.trim()}”.</p>
      )}
      <MenuSeparator />
      <MenuItem asChild>
        <Link href="/settings/workspace/new" className="flex items-center gap-2">
          <Plus size={14} /> New workspace
        </Link>
      </MenuItem>
      <MenuItem asChild>
        <Link href="/agency" className="flex items-center gap-2">
          <Building2 size={14} /> Agency overview
        </Link>
      </MenuItem>
    </Dropdown>
  );
}
