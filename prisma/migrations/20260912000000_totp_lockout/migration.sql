-- TOTP brute-force guard: per-account failure counter + lockout timestamp,
-- checked at login (auth.ts) and setup-confirm (actions/auth.ts).
ALTER TABLE "User" ADD COLUMN "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "twoFactorLockedUntil" TIMESTAMP(3);
