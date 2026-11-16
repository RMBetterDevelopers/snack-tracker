import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better Auth's own HTTP endpoints (/api/auth/*). The only API route in the app.
export const { GET, POST } = toNextJsHandler(auth);
