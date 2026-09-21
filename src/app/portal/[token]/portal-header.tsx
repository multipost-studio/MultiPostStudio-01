import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Calendar, CheckCircle2, BarChart3 } from "lucide-react";

export function PortalHeader({
  token,
  workspaceName,
  linkLabel,
  logoUrl,
  primaryColor,
  activeTab,
}: {
  token: string;
  workspaceName: string;
  linkLabel: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  activeTab: "review" | "calendar" | "reports";
}) {
  const customStyle: React.CSSProperties = primaryColor
    ? ({ "--portal-primary": primaryColor } as React.CSSProperties)
    : {};

  return (
    <header
      className="mb-8 border-b border-[var(--border)] pb-6"
      style={customStyle}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt={workspaceName}
                className="h-9 w-auto max-w-[140px] rounded object-contain"
              />
            ) : null}
            <h1 className="text-[24px] font-bold leading-tight text-[var(--text)]">
              {workspaceName}
            </h1>
          </div>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Client Portal · Access granted for{" "}
            <span className="font-medium text-[var(--text)]">{linkLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!logoUrl && <Logo />}
        </div>
      </div>

      <nav className="mt-6 flex items-center gap-2 border-t border-[var(--border)] pt-4 text-[13px] font-medium">
        <Link
          href={`/portal/${token}`}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
            activeTab === "review"
              ? "bg-[var(--surface-active)] font-semibold text-[var(--text)] shadow-sm"
              : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Review Backlog</span>
        </Link>
        <Link
          href={`/portal/${token}/calendar`}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
            activeTab === "calendar"
              ? "bg-[var(--surface-active)] font-semibold text-[var(--text)] shadow-sm"
              : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Content Calendar</span>
        </Link>
        <Link
          href={`/portal/${token}/reports`}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
            activeTab === "reports"
              ? "bg-[var(--surface-active)] font-semibold text-[var(--text)] shadow-sm"
              : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Performance Reports</span>
        </Link>
      </nav>
    </header>
  );
}
