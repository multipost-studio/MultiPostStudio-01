import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const isEgressDebug = process.env.EGRESS_DEBUG === "true";

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isEgressDebug
      ? ["query", "warn", "error"]
      : process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
