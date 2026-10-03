import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const isEgressDebug = process.env.EGRESS_DEBUG === "true";

function getDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const limit = url.searchParams.get("connection_limit");
    // Under Next.js prerendering or concurrent SSR queries, connection_limit=1
    // causes P2024 pool timeout errors because queries queue up behind the single connection.
    // Ensure connection_limit is at least 5 and pool_timeout is at least 30s.
    if (!limit || parseInt(limit, 10) < 5) {
      url.searchParams.set("connection_limit", "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createClient(): PrismaClient {
  const url = getDatabaseUrl();
  const client = new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: isEgressDebug
      ? ["query", "warn", "error"]
      : process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

  if (!isEgressDebug || process.env.NODE_ENV === "production") return client;

  /**
   * Egress-first safeguard: with EGRESS_DEBUG=true, warn in development
   * whenever a findMany runs without `take`. Unbounded list reads are the #1
   * way Supabase database egress scales with data instead of UI. Warning
   * only — never blocks, never logs row data, never runs in production.
   */
  return client.$extends({
    name: "egress-guard",
    query: {
      $allModels: {
        $allOperations: async ({ model, operation, args, query }) => {
          const take = (args as { take?: unknown } | undefined)?.take;
          if (operation === "findMany" && take == null) {
            console.warn(`[egress] unbounded findMany on ${model} — add take/select (dev-only warning)`);
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const db = globalForPrisma.prisma ?? createClient();

// Always store on globalThis so that within a single Node.js process (e.g. Next.js build
// worker or long-lived server), all chunks and modules share the exact same PrismaClient
// instance and connection pool instead of opening duplicate pools.
globalForPrisma.prisma = db;
