import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = {
  title: "Affiliate Program Terms",
  description: "Terms and disclosure requirements for the MultiPost Studio Affiliate Program.",
};

export default function AffiliateTermsPage() {
  return (
    <LegalPage title="Affiliate Program Terms" updated="September 2026">
      <p>
        <strong>Draft — pending legal counsel review.</strong> These terms describe how the MultiPost Studio
        Affiliate Program works today. They are not yet reviewed by qualified legal counsel and should not be
        treated as a final, binding agreement until that review is complete.
      </p>

      <h2>1. What the program is</h2>
      <p>
        The Affiliate Program pays a real commission, in real money, on paid subscriptions that convert through
        your unique affiliate link. It is separate from the Refer &amp; earn program, which grants non-monetary AI
        credits and runs independently.
      </p>

      <h2>2. Eligibility and application</h2>
      <p>
        Anyone with a MultiPost Studio account may apply. Depending on current program settings, applications are
        either reviewed by our team before approval or approved automatically. We may decline or later suspend an
        application at our discretion, including for the prohibited practices listed below.
      </p>

      <h2>3. Commission structure</h2>
      <p>
        Your commission type (a percentage of the subscription, recurring or one-time, or a fixed amount),
        rate, recurring duration, and payout threshold are set on your affiliate account and shown on your{" "}
        affiliate dashboard. These may differ between affiliates and may change for future signups; changes do not
        apply retroactively to commissions already earned.
      </p>
      <p>
        Attribution is first-touch: the first affiliate link an organization signs up through is the one credited,
        permanently, for that organization. Commissions are generated only on successful, paid invoices — never on
        trials, refunded charges, or invoices that are later reversed.
      </p>

      <h2>4. Payouts</h2>
      <p>
        Commissions accrue as <strong>pending</strong>, move to <strong>approved</strong> after our review, and are
        grouped into a payout once your approved balance passes your payout threshold. A payout is only marked{" "}
        <strong>paid</strong> after we&apos;ve actually sent the money through whatever payment method you&apos;ve
        arranged with us — there is no automatic transfer, and marking a payout paid in our system is a record of
        a payment already made, not the trigger for one.
      </p>

      <h2>5. Disclosure requirement</h2>
      <p>
        By participating, you agree to clearly and conspicuously disclose your affiliate relationship with
        MultiPost Studio whenever you share your affiliate link — for example in the content itself, not only in a
        profile bio or a page visitors are unlikely to see. This mirrors standard affiliate-marketing disclosure
        practice; how it maps to any specific advertising-disclosure regulation in your jurisdiction is between you
        and that regulation, and isn&apos;t something we can certify on your behalf.
      </p>

      <h2>6. Prohibited practices</h2>
      <ul>
        <li>Referring yourself, an account you control, or an account of someone you have an undisclosed arrangement with in exchange for a cut of the commission.</li>
        <li>Bidding on MultiPost Studio&apos;s own trademarked terms in paid search advertising.</li>
        <li>Spam, unsolicited bulk messaging, or misleading claims about MultiPost Studio to generate signups.</li>
        <li>Any attempt to manipulate click or conversion tracking.</li>
      </ul>
      <p>
        We may reverse commissions, withhold payout, suspend, or terminate an affiliate account for violating any
        of the above, and may reverse or claw back a commission tied to a subscription that itself was fraudulent,
        refunded, or charged back.
      </p>

      <h2>7. Tax</h2>
      <p>
        You are responsible for reporting and paying any tax owed on commissions you receive. We may ask for tax
        information before releasing a payout where we&apos;re required to collect it.
      </p>

      <h2>8. Termination</h2>
      <p>
        Either party may end the affiliate relationship at any time. Commissions already earned and approved
        before termination are still payable once they clear our normal review; pending commissions not yet
        approved at termination may be forfeited.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms or the commission structure going forward. Material changes will be reflected
        here with an updated date; continued participation after a change means you accept the updated terms.
      </p>

      <h2>Questions</h2>
      <p>
        Contact <a href="mailto:multipoststudio@gmail.com">multipoststudio@gmail.com</a> with any affiliate-program
        question.
      </p>
    </LegalPage>
  );
}
