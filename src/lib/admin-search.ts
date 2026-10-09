import { db } from "@/lib/db";

/**
 * Global admin search. One query, a handful of authoritative tables, results capped per type, each result a link
 * to the record's own admin page. Each type is searched only if the caller holds its view permission (users.view,
 * orgs.view, support.view, and billing.view with orgs.view, since an invoice opens its organization page), so search is never a way around a page the person cannot open.
 * Nothing is returned beyond what the destination page already shows: no password hashes, tokens or secrets are
 * ever selected.
 */
export type AdminSearchResult = {
  type: "user" | "organization" | "ticket" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/** What the caller may see, straight from their resolved permissions: each result type needs its own view permission. */
export type AdminSearchScope = { users: boolean; orgs: boolean; tickets: boolean; invoices: boolean };

export function scopeFor(perms: ReadonlySet<string>): AdminSearchScope {
  return { users: perms.has("users.view"), orgs: perms.has("orgs.view"), tickets: perms.has("support.view"), invoices: perms.has("billing.view") && perms.has("orgs.view") };
}

export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const PER_TYPE = 5;

export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  return q.length >= MIN_QUERY ? q : null;
}

export async function searchAdmin(rawQuery: unknown, scope: AdminSearchScope): Promise<AdminSearchResult[]> {
  const q = normalizeQuery(rawQuery);
  if (!q) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const none = <T,>(): Promise<T[]> => Promise.resolve([]);

  const [users, orgs, tickets, invoices] = await Promise.all([
    scope.users
      ? db.user.findMany({
          where: { OR: [{ email: contains }, { name: contains }, { id: q }] },
          orderBy: { createdAt: "desc" },
          take: PER_TYPE,
          select: { id: true, email: true, name: true, suspendedAt: true, deletedAt: true },
        })
      : none<{ id: string; email: string; name: string; suspendedAt: Date | null; deletedAt: Date | null }>(),
    scope.orgs
      ? db.organization.findMany({
          where: { OR: [{ name: contains }, { slug: contains }, { id: q }] },
          orderBy: { createdAt: "desc" },
          take: PER_TYPE,
          select: { id: true, name: true, slug: true, deletedAt: true },
        })
      : none<{ id: string; name: string; slug: string; deletedAt: Date | null }>(),
    scope.tickets
      ? db.supportTicket.findMany({
          where: { OR: [{ subject: contains }, { id: q }] },
          orderBy: { updatedAt: "desc" },
          take: PER_TYPE,
          select: { id: true, subject: true, status: true, priority: true },
        })
      : none<{ id: string; subject: string; status: string; priority: string }>(),
    scope.invoices
      ? db.invoice.findMany({
          where: { number: contains },
          orderBy: { createdAt: "desc" },
          take: PER_TYPE,
          select: { id: true, number: true, orgId: true, status: true, currency: true, amountDue: true },
        })
      : none<{ id: string; number: string; orgId: string; status: string; currency: string; amountDue: number }>(),
  ]);

  return [
    ...users.map((u) => ({
      type: "user" as const,
      id: u.id,
      title: u.name || u.email,
      subtitle: `${u.email}${u.deletedAt ? " · deleted" : u.suspendedAt ? " · suspended" : ""}`,
      href: `/admin/users/${u.id}`,
    })),
    ...orgs.map((o) => ({ type: "organization" as const, id: o.id, title: o.name, subtitle: `${o.slug}${o.deletedAt ? " · deleted" : ""}`, href: `/admin/orgs/${o.id}` })),
    ...tickets.map((x) => ({ type: "ticket" as const, id: x.id, title: x.subject, subtitle: `${x.status} · ${x.priority}`, href: `/admin/support/${x.id}` })),
    ...invoices.map((i) => ({
      type: "invoice" as const,
      id: i.id,
      title: i.number,
      subtitle: `${i.status} · ${(i.amountDue / 100).toFixed(2)} ${i.currency.toUpperCase()}`,
      // an invoice opens on its organization page, which needs orgs.view: without it, the result would be a dead link
      href: `/admin/orgs/${i.orgId}`,
    })),
  ];
}
