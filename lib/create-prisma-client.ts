// Builds a Prisma client that talks to Postgres through the `pg` driver adapter
// (Prisma 7 requires a driver adapter).
//
// Deliberately NOT "server-only": prisma/seed.ts and the Vitest DB tests run
// outside Next.js and need their own client. App code must import `prisma`
// from lib/db.ts instead.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
