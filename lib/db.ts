import "server-only";

import type { PrismaClient } from "../generated/prisma/client";
import { createPrismaClient } from "./create-prisma-client";

// The single Prisma client for app code. Only features/*/data-access.ts and
// lib/auth.ts may import it.
//
// In dev, Next.js hot reload re-evaluates modules; caching the client on
// globalThis stops every reload from opening a new connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  return createPrismaClient(connectionString);
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
