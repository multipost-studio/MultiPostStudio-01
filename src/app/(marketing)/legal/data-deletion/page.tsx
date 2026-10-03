import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to delete your MultiPost Studio account and data.",
};

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  // Echo the reference only when it looks like one we issued — never render
  // arbitrary query input back as if it were a confirmed deletion.
  const safeCode = code && /^[A-Za-z0-9_-]{4,64}$/.test(code) ? code : null;
  return (
    <LegalPage title="Data Deletion" updated="September 2026">
      <h2>Deleting your connected social data</h2>
      <p>
        To remove data MultiPost Studio holds for a connected social account, disconnect
        that account under <strong>Settings → Integrations</strong>. Disconnecting revokes
        the platform grant and immediately deletes the stored access tokens together with
        the account and its channels. Drafts and posts you created stay in your workspace;
        synced metrics for the disconnected account simply stop updating.
      </p>
      <p>
        To delete your entire MultiPost Studio account and all associated data, contact{" "}
        <a href="mailto:multipoststudio@gmail.com">multipoststudio@gmail.com</a> from the
        email on your account.
      </p>
      {safeCode ? (
        <>
          <h2>Deletion request status</h2>
          <p>
            Reference code: <code>{safeCode}</code>. Your request has been received and the
            associated platform data has been queued for removal. Email the address above
            with this code if you need written confirmation.
          </p>
        </>
      ) : null}
    </LegalPage>
  );
}
