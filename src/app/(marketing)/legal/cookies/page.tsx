import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../_legal-page";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Exactly which cookies MultiPost Studio sets, what each one is for, how long it lasts, and how to control them.",
};

type Row = { name: string; purpose: string; duration: string };

const ESSENTIAL: Row[] = [
  { name: "authjs.session-token (__Secure-authjs.session-token on the live site)", purpose: "Keeps you signed in.", duration: "Up to 30 days" },
  { name: "authjs.csrf-token, authjs.callback-url (prefixed __Host- / __Secure- on the live site)", purpose: "Protects the sign-in form from forged requests and returns you to the page you wanted.", duration: "Session" },
  { name: "mps_ws", purpose: "Remembers which workspace you have open.", duration: "1 year" },
  { name: "mps_oauth_state, mps_int_oauth_state", purpose: "A one-time security token used only while you connect a social account or a Google service, so the connection cannot be hijacked.", duration: "Minutes" },
  { name: "mps_aff_code", purpose: "Only set if you create an account after following an affiliate link. It credits the person who referred you.", duration: "1 hour" },
  { name: "mps_consent", purpose: "Remembers your answer to the cookie question on this page.", duration: "1 year" },
  { name: "sidebar_state", purpose: "Remembers whether you collapsed the app sidebar.", duration: "7 days" },
];

const ANALYTICS: Row[] = [
  { name: "mps_vid", purpose: "A random identifier (no name or email) so we can count unique visitors rather than page loads.", duration: "1 year" },
  { name: "mps_ft", purpose: "Remembers where you first came from (for example a campaign link or a search engine) so that, if you sign up, we know which campaign worked.", duration: "90 days" },
  { name: "mps_lt", purpose: "Remembers the most recent campaign link you arrived from, for the same purpose.", duration: "90 days" },
  { name: "_ga, _ga_<id>", purpose: "Google Analytics 4: counts visits and shows which pages are used.", duration: "Up to 2 years" },
];

function CookieTable({ rows }: { rows: Row[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Cookie</th>
          <th>What it does</th>
          <th>Lasts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td>
              <code>{r.name}</code>
            </td>
            <td>{r.purpose}</td>
            <td>{r.duration}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="October 2026">
      <p>
        This page lists every cookie MultiPost Studio sets, what it is for and how long it lasts. We keep it short on purpose: there are
        two groups, and only one of them needs your permission.
      </p>

      <h2>Essential cookies</h2>
      <p>
        These make sign-in and the app work. They are always on, and they do not track you across other sites. Blocking them will stop you
        signing in.
      </p>
      <CookieTable rows={ESSENTIAL} />
      <p>
        Your theme and which navigation sections you have collapsed are kept in your browser&apos;s local storage, not in cookies, and are
        never sent to us.
      </p>

      <h2>Analytics cookies (need your permission where the law requires it)</h2>
      <p>
        We use these to understand which pages and which campaigns bring people to MultiPost Studio, so we can spend our effort on what
        works. We do not use them for advertising and we do not build advertising profiles.
      </p>
      <CookieTable rows={ANALYTICS} />
      <p>
        The three <code>mps_</code> cookies are first-party: they are set by us, and the visit record they feed contains the page you landed
        on, the campaign tags in the link (the <code>utm_</code> parameters), the website you came from and a random identifier. It contains
        no IP address, no browser fingerprint, and no name or email. If you then create an account, we store the campaign and source
        alongside it so we can see which campaigns produce real customers; that record is removed when your account is erased. Anonymous
        visit records are deleted after 400 days.
      </p>
      <p>
        Google Analytics is provided by Google LLC. It sets its own cookies on this site and sends usage data to Google. Google states that
        Google Analytics 4 does not log or store IP addresses. See{" "}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
          how Google uses information from sites that use its services
        </a>
        .
      </p>

      <h2>When we ask, and when we don&apos;t</h2>
      <ul>
        <li>
          <strong>European Economic Area, United Kingdom, Switzerland and India:</strong> analytics cookies stay off until you press{" "}
          <em>Accept</em>.
        </li>
        <li>
          <strong>Anywhere we cannot tell where you are:</strong> treated the same way, and analytics stay off until you accept.
        </li>
        <li>
          <strong>Everywhere else:</strong> analytics run by default and you see the same notice, with an equally easy <em>Decline</em>. If you would rather be asked first, press Decline.
        </li>
        <li>
          <strong>If you press Decline</strong> in any region, we stop, and we delete the analytics cookies listed above that are already on your
          device.
        </li>
        <li>
          <strong>Do Not Track and Global Privacy Control:</strong> if your browser sends either signal, analytics stay off everywhere,
          whatever else is set.
        </li>
      </ul>
      <p>
        Declining analytics changes nothing about how the product works for you.
      </p>

      <h2>Change your mind at any time</h2>
      <p>
        <CookieSettingsButton className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
          Open cookie settings
        </CookieSettingsButton>{" "}
        to accept or decline again. You can also clear or block cookies in your browser; see the help pages for{" "}
        <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a>,{" "}
        <a href="https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox" target="_blank" rel="noopener noreferrer">Firefox</a> and{" "}
        <a href="https://support.apple.com/guide/safari/manage-cookies-and-website-data-sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a>.
      </p>

      <h2>What we don&apos;t use</h2>
      <p>
        No advertising cookies, no social-media tracking pixels, no cross-site tracking, and no session-replay tools. We do not sell or share
        cookie data for marketing.
      </p>

      <h2>More</h2>
      <p>
        Our <Link href="/legal/privacy">Privacy Policy</Link> explains how we handle personal data generally. Questions about cookies:{" "}
        <a href="mailto:multipoststudio@gmail.com">multipoststudio@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
