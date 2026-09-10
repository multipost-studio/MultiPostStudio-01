-- Admin notification centre.
--
-- Notifications are derived live from current state by the signal registry
-- (src/lib/admin-signals.ts) — nothing is stored, so a badge clears when the
-- condition clears. This table only records which derived items each admin
-- has acknowledged, so "unread" and "mark all read" work per admin.
CREATE TABLE "AdminNotificationSeen" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminNotificationSeen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminNotificationSeen_adminId_itemKey_key" ON "AdminNotificationSeen"("adminId", "itemKey");
CREATE INDEX "AdminNotificationSeen_adminId_idx" ON "AdminNotificationSeen"("adminId");

ALTER TABLE "AdminNotificationSeen" ADD CONSTRAINT "AdminNotificationSeen_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
