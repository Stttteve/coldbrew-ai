import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

// Reuse the Prisma client across hot-reloads in dev to avoid exhausting
// the Postgres connection pool. In prod each lambda instance gets its own.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
