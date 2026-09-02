"use client";

import Link from "next/link";
import { LogOut, User, ShieldCheck, CreditCard, Gauge } from "lucide-react";
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { signOutAction } from "@/app/actions/auth";

export function UserMenu({
  name,
  email,
  image,
  isPlatformAdmin,
}: {
  name: string;
  email: string;
  image?: string | null;
  isPlatformAdmin?: boolean;
}) {
  return (
    <Dropdown
      align="end"
      trigger={
        <button className="flex items-center gap-2 rounded-[var(--radius-md)] p-0.5 hover:bg-[var(--surface-hover)]" aria-label="Account menu">
          <Avatar name={name} src={image} size={28} />
        </button>
      }
    >
      <MenuLabel>
        <span className="block text-[14px] font-semibold text-[var(--text)]">{name}</span>
        <span className="block truncate text-[12px] font-normal normal-case text-[var(--text-subtle)]">{email}</span>
      </MenuLabel>
      <MenuSeparator />
      <MenuItem>
        <Link href="/settings/profile" className="flex items-center gap-2">
          <User size={14} /> Profile
        </Link>
      </MenuItem>
      <MenuItem>
        <Link href="/settings/security" className="flex items-center gap-2">
          <ShieldCheck size={14} /> Security
        </Link>
      </MenuItem>
      <MenuItem>
        <Link href="/settings/billing" className="flex items-center gap-2">
          <CreditCard size={14} /> Billing
        </Link>
      </MenuItem>
      {isPlatformAdmin && (
        <MenuItem>
          <Link href="/admin" className="flex items-center gap-2">
            <Gauge size={14} /> Platform admin
          </Link>
        </MenuItem>
      )}
      <MenuSeparator />
      <form action={signOutAction}>
        <button type="submit" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[14px] text-[var(--danger)] hover:bg-[var(--surface-hover)]">
          <LogOut size={14} /> Sign out
        </button>
      </form>
    </Dropdown>
  );
}
