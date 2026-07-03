import { auth } from "@/server/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

/** Better Auth's catch-all handler (sign-in, sign-out, session, OAuth callback, …). */
export const { GET, POST } = toNextJsHandler(auth);
