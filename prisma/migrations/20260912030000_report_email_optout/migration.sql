-- Scheduled-report email opt-out. Defaults to true (existing behavior
-- preserved); users can turn it off under Settings → Notifications.
ALTER TABLE "NotificationPref" ADD COLUMN "emailReports" BOOLEAN NOT NULL DEFAULT true;
