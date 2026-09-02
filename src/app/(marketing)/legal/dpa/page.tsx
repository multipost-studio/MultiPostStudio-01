import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = { title: "Data Processing Addendum" };

export default function DpaPage() {
  return (
    <LegalPage title="Data Processing Addendum" updated="August 2026">
      <h2>Roles</h2>
      <p>You are the data controller; MultiPost Studio is the processor acting on your documented instructions.</p>
      <h2>Sub-processors</h2>
      <p>We use a short list of infrastructure and AI sub-processors. The current list is available on request and we give notice before adding one.</p>
      <h2>Security measures</h2>
      <ul>
        <li>Encryption in transit and at rest.</li>
        <li>Access on a least-privilege basis with audit logging.</li>
        <li>Tenant isolation enforced at the query layer.</li>
      </ul>
      <h2>International transfers</h2>
      <p>Where data leaves its region, we rely on Standard Contractual Clauses and equivalent safeguards.</p>
      <h2>Deletion</h2>
      <p>On termination we delete or return personal data within 30 days, subject to backup cycles.</p>
      <p>A signable version is available for Team and Enterprise customers — contact legal@multipoststudio.example.</p>
    </LegalPage>
  );
}
