/**
 * Create (or promote) a platform-admin user.
 *
 *   npm run admin:create -- --email you@example.com --password 'min-8-chars' --name 'Your Name'
 *
 * Runs against whatever DATABASE_URL / DIRECT_URL your .env points at. Safe to
 * re-run: an existing user with that email is promoted and its password reset.
 * On first sign-in the user still goes through /onboarding to create a
 * workspace; /admin works immediately.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Accepts both `--key value` and `--key=value`.
const args: Record<string, string> = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      args[body] = next && !next.startsWith("--") ? argv[++i] : "true";
    }
  }
}

const email = String(args.email ?? process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
const password = String(args.password ?? process.env.ADMIN_PASSWORD ?? "");
const name = String(args.name ?? process.env.ADMIN_NAME ?? "Admin");

async function main() {
  if (!email.includes("@") || password.length < 8) {
    console.error(
      "Usage: npm run admin:create -- --email you@example.com --password 'min-8-chars' [--name 'Your Name']",
    );
    process.exit(1);
  }

  const db = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      emailVerified: new Date(),
      isPlatformAdmin: true,
      notificationPref: { create: {} },
    },
    update: { passwordHash, isPlatformAdmin: true, emailVerified: new Date() },
  });

  console.log(`✔ ${user.email} is now a platform admin (id ${user.id}).`);
  console.log("  Sign in at /login, then open /admin.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
