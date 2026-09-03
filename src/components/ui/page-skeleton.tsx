import { Skeleton } from "@/components/ui/misc";

const R = "rounded-[var(--radius-lg)]";

function Header() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

function Cards({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className={`h-24 ${R}`} />
      ))}
    </div>
  );
}

function TableRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className={`overflow-hidden border border-[var(--border)] ${R}`}>
      <Skeleton className="h-11 w-full rounded-none" />
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Grid({ items = 9 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} className={`aspect-square ${R}`} />
      ))}
    </div>
  );
}

function List({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-16 ${R}`} />
      ))}
    </div>
  );
}

function Form() {
  return (
    <div className="max-w-xl space-y-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9.5 w-full rounded-[var(--radius-md)]" />
        </div>
      ))}
      <Skeleton className="h-9.5 w-32 rounded-[var(--radius-md)]" />
    </div>
  );
}

function Split() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Skeleton className={`h-[420px] ${R}`} />
      <Skeleton className={`h-[420px] ${R}`} />
    </div>
  );
}

/**
 * Route-level loading skeleton. `variant` picks the body shape after a
 * standard page header; compose them for pages that need more than one.
 */
export function PageSkeleton({
  variant = "cards",
  header = true,
}: {
  variant?: "cards" | "table" | "grid" | "list" | "form" | "split" | "dashboard";
  header?: boolean;
}) {
  return (
    <div className="space-y-6">
      {header && <Header />}
      {variant === "cards" && <Cards />}
      {variant === "table" && <TableRows />}
      {variant === "grid" && <Grid />}
      {variant === "list" && <List />}
      {variant === "form" && <Form />}
      {variant === "split" && <Split />}
      {variant === "dashboard" && (
        <>
          <Cards />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className={`h-80 lg:col-span-2 ${R}`} />
            <Skeleton className={`h-80 ${R}`} />
          </div>
        </>
      )}
    </div>
  );
}
