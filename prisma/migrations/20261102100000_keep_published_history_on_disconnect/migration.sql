-- Keep a published post's history when its channel is disconnected. Until now, removing a social account deleted its channels and,
-- through them, every post's channel row (the text, the published link and the stats). The row now stays, with its channel link
-- emptied; the app records "@handle" in channelLabel first so the history still says where the post went.
-- Additive and idempotent: no data is changed or removed by this migration.

ALTER TABLE "public"."PostChannel" ADD COLUMN IF NOT EXISTS "channelLabel" TEXT;

ALTER TABLE "public"."PostChannel" ALTER COLUMN "channelId" DROP NOT NULL;

ALTER TABLE "public"."PostChannel" DROP CONSTRAINT IF EXISTS "PostChannel_channelId_fkey";

ALTER TABLE "public"."PostChannel"
  ADD CONSTRAINT "PostChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."SocialChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
