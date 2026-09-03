import { LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { SystemPage, SystemActions } from "@/components/system-page";

export const metadata: Metadata = { title: "Sign in required" };

export default function UnauthorizedPage() {
  return (
    <SystemPage
      code="401"
      icon={<LockKeyhole size={22} />}
      title="Your session has ended"
      description="You need to be signed in to view this page. Sessions expire after a period of inactivity — sign back in and you'll return right where you left off."
      actions={
        <SystemActions
          primary={{ href: "/login", label: "Sign in" }}
          secondary={{ href: "/", label: "Go to homepage" }}
        />
      }
      footer={
        <>
          Trouble signing in?{" "}
          <a href="/forgot" className="text-[var(--primary)] hover:underline">
            Reset your password
          </a>
          .
        </>
      }
    />
  );
}
