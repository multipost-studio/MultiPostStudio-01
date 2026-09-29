import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "What cookies MultiPost Studio uses and why.",
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="August 2026">
      <h2>What we use</h2>
      <ul>
        <li><strong>Essential</strong> — session and security cookies needed to sign in and keep you signed in.</li>
        <li><strong>Preferences</strong> — remembers your theme and last-used workspace.</li>
      </ul>
      <p>
        We don&apos;t currently run any analytics or tracking cookies. If that changes, we&apos;ll update this page
        and add a consent mechanism before any non-essential cookie is set — not after.
      </p>
      <h2>What we don&apos;t use</h2>
      <p>No third-party advertising or cross-site tracking cookies.</p>
      <h2>Managing cookies</h2>
      <p>You can clear or block cookies in your browser. Blocking essential cookies will prevent sign-in.</p>
    </LegalPage>
  );
}
