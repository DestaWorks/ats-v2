import { z } from "zod";

/** `GET /api/me/preferences` response — the signed-in user's own profile fields. */
export interface UserPreferencesDTO {
  emailSignature: string | null;
  stickyNote: string | null;
  // Wave 5.4 (My Profile) — avatar reuses Better Auth's own `image` field (updated via
  // `authClient.updateUser`, not this route); these are the app-specific extras.
  bio: string | null;
  phone: string | null;
  location: string | null;
}

/**
 * Body for `PATCH /api/me/preferences` (Wave 4.1 Templates + Wave 5.4 My Profile). All fields
 * optional — only supplied ones change. `null` clears a value; omitting a key leaves it untouched.
 */
export const updatePreferencesSchema = z
  .object({
    emailSignature: z.string().trim().max(2000).nullish(),
    stickyNote: z.string().trim().max(2000).nullish(),
    bio: z.string().trim().max(1000).nullish(),
    phone: z.string().trim().max(50).nullish(),
    location: z.string().trim().max(200).nullish(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
