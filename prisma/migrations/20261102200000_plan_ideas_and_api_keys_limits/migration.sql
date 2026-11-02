-- Two more per-plan limits an admin can set in /admin/plans: how many ideas can sit on the Ideas board at once, and how many API keys
-- can be active. 0 = unlimited (the same convention as the other limits), so every existing plan keeps behaving exactly as it does
-- today until an admin sets a number. Additive and idempotent: no existing data is changed.

ALTER TABLE "public"."Plan" ADD COLUMN IF NOT EXISTS "maxIdeas" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."Plan" ADD COLUMN IF NOT EXISTS "maxApiKeys" INTEGER NOT NULL DEFAULT 0;
