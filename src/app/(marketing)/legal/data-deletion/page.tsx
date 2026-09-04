import type { Metadata } from "next";
import { LegalPage } from "../_legal-page";

export const metadata: Metadata = { title: "Data Deletion" };

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <LegalPage title="Data Deletion" updated="September 2026">
      <h2>Deleting your connected social data</h2>
      <p>
        To remove data MultiPost Studio holds for a connected social account, disconnect
        that account under <strong>Settings → Integrations</strong>. Disconnecting
        immediately deletes the stored access tokens and the posts, metrics, and
        conversations synced from that platform.
      </p>
      <p>
        To delete your entire MultiPost Studio account and all associated data, contact{" "}
        <a href="mailto:multipoststudio@gmail.com">multipoststudio@gmail.com</a> from the
        email on your account.
      </p>
      {code ? (
        <>
          <h2>Deletion request status</h2>
          <p>
            Reference code: <code>{code}</code>. Your request has been received and the
            associated platform data has been queued for removal. Email the address above
            with this code if you need written confirmation.
          </p>
        </>
      ) : null}
    </LegalPage>
  );
}
