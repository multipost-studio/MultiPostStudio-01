import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How MultiPost Studio collects, uses, stores and deletes your data, including data accessed through Google APIs.",
};

/**
 * Google's OAuth verification rejected the previous version of this page for
 * "insufficient content". It was 28 lines of generic text, it gave a contact
 * address on the reserved .example TLD that no one can reach, it never named
 * the Google data the app actually requests, and every legal page carried a
 * banner saying the copy was placeholder and not a real agreement.
 *
 * Google's requirements for a verifiable policy are specific: name the app,
 * disclose exactly which Google user data is accessed and why, say how it is
 * stored, shared, protected and deleted, give a working contact, and state
 * compliance with the Limited Use requirements. Every scope listed below is
 * one the app really requests — see src/lib/social/providers.ts and
 * src/lib/integrations/providers.ts.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 2026">
      <p>
        This policy explains what MultiPost Studio (&ldquo;we&rdquo;, &ldquo;the app&rdquo;) collects when you
        use it to schedule and publish social media content, why we collect it, and how you can get it back
        or have it deleted. It covers the app at multipost-studio.vercel.app and every account created on it.
      </p>

      <h2>Who we are</h2>
      <p>
        MultiPost Studio is a social media management tool. You connect your own social accounts, create and
        schedule posts, and we publish them on your behalf at the times you choose. We are the data
        controller for your account data and the processor for the content you publish through us.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your name, email address, password hash (or Google sign-in
          identifier), timezone and profile photo if you set one.
        </li>
        <li>
          <strong>Content you create.</strong> Posts, drafts, captions, media you upload, comments, campaigns,
          approval decisions and any notes you add.
        </li>
        <li>
          <strong>Connected social accounts.</strong> Access and refresh tokens for the accounts you connect,
          your handle and profile identifiers on those platforms, and the metrics those platforms report about
          the posts we published for you.
        </li>
        <li>
          <strong>Billing information.</strong> Your plan, billing contact details and invoices. Card and bank
          details are handled entirely by our payment provider and never reach our servers.
        </li>
        <li>
          <strong>Usage and diagnostics.</strong> Sign-in times, device and browser information, IP address,
          and error logs, used to keep the service running and to detect abuse.
        </li>
      </ul>

      <h2>Google user data</h2>
      <p>
        If you sign in with Google or connect a Google service, the app requests only the scopes it needs for
        the feature you asked for. It requests no Google data beyond these:
      </p>
      <ul>
        <li>
          <strong>Sign-in</strong> (<code>email</code>, <code>profile</code>) — to create and identify your
          MultiPost Studio account. We store your email address, name and profile photo URL.
        </li>
        <li>
          <strong>YouTube upload</strong> (<code>youtube.upload</code>) — to publish the videos you schedule
          in MultiPost Studio to the YouTube channel you connected. Used only when a scheduled post reaches
          its publish time.
        </li>
        <li>
          <strong>YouTube channel data</strong> (<code>youtube.readonly</code>, <code>youtube.force-ssl</code>)
          — to show your channel, list the posts we published, and read and reply to comments inside the app.
        </li>
        <li>
          <strong>YouTube analytics</strong> (<code>yt-analytics.readonly</code>) — to show the views and
          engagement of your posts in your MultiPost Studio analytics.
        </li>
        <li>
          <strong>Google Drive</strong> (<code>drive.readonly</code>) — to let you pick an image or video from
          your Drive to attach to a post. We read only the file you select, at the moment you select it.
        </li>
      </ul>
      <p>
        We do not read, index or store the contents of your Drive beyond the files you explicitly choose. We
        do not use Google user data to train any machine learning model, our own or anyone else&rsquo;s. We do
        not sell it and we do not transfer it to third parties for advertising, market research or credit
        assessment.
      </p>

      <h2>Limited Use</h2>
      <p>
        MultiPost Studio&rsquo;s use and transfer of information received from Google APIs to any other app
        will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>How we use your data</h2>
      <ul>
        <li>To operate the service: scheduling, publishing to the accounts you connected, and analytics.</li>
        <li>To show you your own performance data retrieved from the platforms you connected.</li>
        <li>
          To generate content when you ask for it. AI features send the text of your prompt and your
          workspace&rsquo;s brand context to our AI provider to produce a draft. Your connected-account tokens
          and Google user data are never sent to an AI provider.
        </li>
        <li>To notify you about approvals, failures and account activity.</li>
        <li>To bill you, to support you, and to detect and prevent abuse.</li>
      </ul>

      <h2>How your data is stored and protected</h2>
      <ul>
        <li>
          <strong>Social account tokens are encrypted at rest</strong> with AES-256-GCM under a dedicated
          encryption key, separate from the database.
        </li>
        <li>Passwords are stored only as salted hashes; we never store them in a readable form.</li>
        <li>All traffic to and from the app is served over HTTPS.</li>
        <li>
          Your data is isolated per workspace, and every request is checked against your role and workspace
          membership before any record is returned.
        </li>
        <li>
          You can see and revoke your active sessions and devices at any time from Settings &rarr; Devices.
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We do not sell personal data. We share it only with the service providers needed to run the product,
        each acting on our instructions:
      </p>
      <ul>
        <li>
          <strong>Hosting and database</strong> — our application host and managed Postgres provider, who
          store your account and content data.
        </li>
        <li>
          <strong>Object storage</strong> — for the media files you upload.
        </li>
        <li>
          <strong>The social platforms you connect</strong> — we send them the posts you schedule. Their own
          privacy policies govern what they do with that content once published.
        </li>
        <li>
          <strong>AI provider</strong> — receives prompt text and brand context when you use an AI feature.
        </li>
        <li>
          <strong>Payment provider</strong> — handles card details directly and returns only the subscription
          status and invoices.
        </li>
        <li>
          <strong>Email provider</strong> — delivers transactional email such as invitations and alerts.
        </li>
      </ul>
      <p>We may also disclose data where required by law, or to protect the rights and safety of users.</p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your content while your account is active. When you delete your account, your workspaces,
        posts, media and connected-account tokens are deleted within 30 days, after which they persist only in
        encrypted backups until those rotate out. Disconnecting a social account deletes its stored tokens
        immediately.
      </p>
      <p>
        You can request deletion at any time — see our{" "}
        <Link href="/legal/data-deletion">data deletion instructions</Link>.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, export, correct or delete your data. Most of this is available directly in the app
        under Settings; for anything else, email us and we will action it within 30 days. Depending on where
        you live you may also have the right to object to processing, to restrict it, or to complain to your
        local data protection authority.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies that are necessary to keep you signed in and to remember your active workspace. See our{" "}
        <Link href="/legal/cookies">cookie policy</Link> for details.
      </p>

      <h2>Children</h2>
      <p>
        MultiPost Studio is not intended for anyone under 16, and we do not knowingly collect data from
        children. If you believe a child has given us data, contact us and we will delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how we use your data we will update this page and change the date at the top. Material
        changes will also be sent to the email address on your account.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy, or any request about your data:{" "}
        <a href="mailto:multipoststudio@gmail.com">multipoststudio@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
