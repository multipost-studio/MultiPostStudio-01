import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = {
  title: "Data Processing Notice (India DPDP)",
  description: "An itemised notice of what personal data MultiPost Studio processes and why, for users in India.",
};

type Row = { data: string; purpose: string };

const CATEGORIES: { title: string; rows: Row[] }[] = [
  {
    title: "Account & sign-in",
    rows: [
      { data: "Name, email, password", purpose: "Create and secure your account, sign you in" },
      { data: "Two-factor authentication code (if enabled)", purpose: "Extra sign-in security you choose to turn on" },
      { data: "IP address, device/browser information, session activity", purpose: "Detect suspicious sign-ins, keep your account secure" },
    ],
  },
  {
    title: "Organization & billing",
    rows: [
      { data: "Billing name, email, address, tax ID", purpose: "Generate invoices, process payment, meet tax record-keeping obligations" },
      { data: "Subscription and invoice history", purpose: "Billing history, accounting, dispute resolution" },
    ],
  },
  {
    title: "Connected social accounts",
    rows: [
      { data: "OAuth access tokens for platforms you connect (Facebook, Instagram, LinkedIn, X, TikTok, Pinterest, YouTube, Threads, and similar)", purpose: "Publish, schedule and read analytics on your behalf, on the accounts you connect" },
      { data: "Connected-account profile info (handle, display name, avatar)", purpose: "Show you which account you're posting as" },
    ],
  },
  {
    title: "Content you create",
    rows: [
      { data: "Post drafts, published content, uploaded media", purpose: "The core service — creating and scheduling your content" },
      { data: "Comments and messages imported from your connected accounts", purpose: "Let you view and respond to your own audience from one inbox" },
      { data: "Contact profiles for people who engage with your connected accounts", purpose: "Help you keep track of your own audience relationships" },
    ],
  },
  {
    title: "AI features (if you use them)",
    rows: [
      { data: "Prompts and generated content", purpose: "Generate captions, ideas or suggestions you request" },
      { data: "Your own AI provider API key (if you bring your own key)", purpose: "Route your AI requests to your own provider account, at your own cost — stored encrypted, never shown in full" },
    ],
  },
  {
    title: "Support & communications",
    rows: [
      { data: "Support ticket contents, contact-form submissions", purpose: "Respond to your questions and requests" },
    ],
  },
  {
    title: "Referral & affiliate programs (optional, opt-in)",
    rows: [
      { data: "Referral/affiliate code, referred organization, commission and payout records", purpose: "Run the reward or commission program you chose to join" },
    ],
  },
];

export default function DpdpNoticePage() {
  return (
    <LegalPage title="Data Processing Notice (India DPDP)" updated="September 2026">
      <p>
        This notice is written to stand on its own, separately from our general{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>, for anyone in India exercising rights under the Digital
        Personal Data Protection Act, 2023 and its 2025 Rules. It lists, category by category, what personal data
        we process and why. Where we rely on your consent, you can withdraw it as easily as you gave it; where we
        don&apos;t, that&apos;s noted too.
      </p>

      <h2>What we process, and why</h2>
      {CATEGORIES.map((cat) => (
        <div key={cat.title}>
          <h3>{cat.title}</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {cat.rows.map((r) => (
                <tr key={r.data}>
                  <td>{r.data}</td>
                  <td>{r.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Legal basis</h2>
      <p>
        Most of what&apos;s listed above is data you provide voluntarily to get the specific service you signed up
        for — creating an account, connecting a platform, publishing a post — and we haven&apos;t been told you
        object to that use. Where we ask for something separately and optionally, such as joining the Affiliate
        Program, we record your acceptance directly (see{" "}
        <Link href="/legal/affiliate-terms">Affiliate Program Terms</Link>) and you can stop participating at any
        time from your account.
      </p>

      <h2>Who else sees it</h2>
      <p>
        We share data with the specific processors needed to run the service — your connected social platforms,
        our payment processor, our email and hosting providers, and (only if you use AI features) an AI provider —
        never for their own marketing purposes. See the <Link href="/legal/dpa">DPA</Link> for the processor list.
      </p>

      <h2>Your rights and how to use them</h2>
      <ul>
        <li>Access a summary of the personal data we hold about you</li>
        <li>Correct or update inaccurate data</li>
        <li>Request erasure of your data, subject to records we&apos;re required to keep (invoices, audit trail)</li>
        <li>Withdraw any consent you&apos;ve given, at any time</li>
        <li>Raise a complaint about how your data is handled</li>
      </ul>
      <p>
        Most of this is available directly in the app under Settings. For anything else, email{" "}
        <a href="mailto:multipoststudio@gmail.com">multipoststudio@gmail.com</a> — see{" "}
        <Link href="/legal/data-deletion">data deletion instructions</Link> for the account-deletion flow
        specifically. We aim to respond within a reasonable time; we&apos;re working toward the 90-day response
        window the Rules specify as we build out a dedicated rights-request system.
      </p>

      <h2>Full policy</h2>
      <p>
        For our complete data-handling practices, including retention and security, see the full{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
