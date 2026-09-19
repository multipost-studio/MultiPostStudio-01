import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const isEgressDebug = process.env.EGRESS_DEBUG === "true";

function createClient(): PrismaClient {
  const client = new PrismaClient({
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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
