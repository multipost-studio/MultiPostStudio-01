import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 2026">
      <h2>Your account</h2>
      <p>You&apos;re responsible for activity under your account and for keeping credentials secure.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t use Cadence to break a social platform&apos;s terms.</li>
        <li>No spam, harassment, or automated data collection that violates third-party rules.</li>
        <li>Competitor tracking is limited to public data within platform policies.</li>
      </ul>
      <h2>Your content</h2>
      <p>You keep ownership of everything you create. You grant us the limited rights needed to store, process and publish it on your behalf.</p>
      <h2>Availability</h2>
      <p>We aim for high uptime but the service is provided &ldquo;as is.&rdquo; See the DPA and an order form for any committed SLA.</p>
      <h2>Termination</h2>
      <p>Either party may end the agreement per the plan terms. You can export your data before deletion.</p>
    </LegalPage>
  );
}
