import { z } from "zod";

/**
 * Auth input schemas (shared client ↔ server). Used by the sign-in form (client)
 * and the auth route (server) so both validate identically. Real schema — reused
 * when Better Auth lands in Wave 0.3.
 */

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

// Upper bounds on the PUBLIC (unauthenticated) access-request fields — a cheap guard against a
// resource-exhaustion / payload-bloat abuse of the one endpoint anyone can hit without an account.
export const accessRequestSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Keep it under 200 characters"),
  email: z.email("Enter a valid email address"),
  organization: z.string().max(200, "Keep it under 200 characters").optional(),
  message: z.string().max(2000, "Keep it under 2000 characters").optional(),
});
export type AccessRequestInput = z.infer<typeof accessRequestSchema>;
