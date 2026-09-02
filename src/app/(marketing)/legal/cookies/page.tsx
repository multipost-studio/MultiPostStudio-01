import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="August 2026">
      <h2>What we use</h2>
      <ul>
        <li><strong>Essential</strong> — session and security cookies needed to sign in and keep you signed in.</li>
        <li><strong>Preferences</strong> — remembers your theme and last-used workspace.</li>
        <li><strong>Analytics</strong> — aggregate product usage, only with consent where required.</li>
      </ul>
      <h2>What we don&apos;t use</h2>
      <p>No third-party advertising or cross-site tracking cookies.</p>
      <h2>Managing cookies</h2>
      <p>You can clear or block cookies in your browser. Blocking essential cookies will prevent sign-in.</p>
    </LegalPage>
  );
}
