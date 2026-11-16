import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";

// Better Auth reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Users exist only through the seed for now; nobody can sign up.
    disableSignUp: true,
  },
  // nextCookies() must be the last plugin: it lets Server Actions set cookies.
  plugins: [nextCookies()],
});
