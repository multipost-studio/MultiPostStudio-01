import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma config (replaces the deprecated `prisma` key in package.json).
 * NOTE: with this file present Prisma no longer auto-loads `.env`, hence the
 * `dotenv/config` import above so `DATABASE_URL` is picked up by the CLI.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
