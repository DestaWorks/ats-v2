import { z } from "zod";

/** `GET /api/me/preferences` response — the signed-in user's own signature + sticky note. */
export interface UserPreferencesDTO {
  emailSignature: string | null;
  stickyNote: string | null;
}

/**
 * Body for `PATCH /api/me/preferences` (Wave 4.1, Templates). Both fields optional — only supplied
 * ones change. `null` clears a value; omitting a key leaves it untouched.
 */
export const updatePreferencesSchema = z
  .object({
    emailSignature: z.string().trim().max(2000).nullish(),
    stickyNote: z.string().trim().max(2000).nullish(),
  })
  .strict()
  .refine((v) => v.emailSignature !== undefined || v.stickyNote !== undefined, {
    message: "Provide at least one field to update",
  });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
