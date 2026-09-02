import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2026">
      <h2>What we collect</h2>
      <p>
        Account details you provide (name, email), content you create in Cadence, connected social account
        tokens (stored encrypted), and usage data needed to run and improve the product.
      </p>
      <h2>How we use it</h2>
      <ul>
        <li>To operate the service: publishing, analytics, notifications.</li>
        <li>To provide AI generation conditioned on your workspace&apos;s Brand Brain.</li>
        <li>To support you and to detect abuse.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <p>We don&apos;t sell personal data and we don&apos;t use your content to train third-party models.</p>
      <h2>Your rights</h2>
      <p>Access, export, correct or delete your data by contacting privacy@cadence.example.</p>
      <h2>Retention</h2>
      <p>Content is kept while your account is active and removed within 30 days of deletion, subject to backups.</p>
    </LegalPage>
  );
}
