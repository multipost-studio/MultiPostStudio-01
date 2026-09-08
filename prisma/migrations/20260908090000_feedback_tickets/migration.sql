-- In-app feedback reuses SupportTicket rather than adding a parallel table:
-- both are "a person told us something", and the admin queue already triages
-- these with status and priority.
--
-- kind separates the two so the queue can be filtered. context records where
-- in the app the feedback was sent from, which is most of the triage value for
-- a bug report. attachmentUrl is nullable because the attachment control is
-- only offered when object storage is configured.
ALTER TABLE "SupportTicket" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'support';
ALTER TABLE "SupportTicket" ADD COLUMN "context" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "attachmentUrl" TEXT;
