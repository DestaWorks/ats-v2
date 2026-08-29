import { z } from "zod";
import type { Role } from "@destaworks/domain/constants";

/**
 * Auth input schemas (shared client ↔ server). Used by the sign-in form (client)
 * and the auth route (server) so both validate identically. Real schema — reused
 * when Better Auth lands in Wave 0.3.
 */

/**
 * The signed-in operator as `/api/me` publishes them: identity and role, and deliberately
 * nothing else off the session record. A wire shape rather than an internal one — the client
 * reads it — so it is listed field by field here instead of derived from the auth user.
 */
export interface SessionUserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
}

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

/**
 * Body of `POST /access-requests`. `.strict()` rather than the form schema's default strip: the
 * workspace is resolved from the request host, so a key naming one must be a 422 and never a value
 * the endpoint could be tempted to read.
 */
export const submitAccessRequestSchema = accessRequestSchema.strict();
export type SubmitAccessRequestInput = z.infer<typeof submitAccessRequestSchema>;

/** Response body of `POST /access-requests` — acceptance only, never the applicant's details. */
export interface PostAccessRequestResponse {
  ok: true;
}

// Forgot-password (2026-08-02). Better Auth's own `resetPassword` server route enforces the real
// min/max length (defaults 8/128); this schema is client-side UX only — matches the same 8-char
// minimum the My Profile "Change Password" form already uses (`profile-view.tsx`).
export const requestPasswordResetSchema = z.object({
  email: z.email("Enter a valid email address"),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
