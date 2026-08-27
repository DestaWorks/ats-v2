/**
 * Saved-ICP contract (Client Discovery, new domain) — isomorphic types + zod shared by
 * `saved-icp.service.ts`, the API routes, and the `/client-discovery` search panel. Mirrors
 * `validation/saved-view.ts`'s shape, EXCEPT the filter is stored as real, structured columns
 * (not an opaque raw querystring) — see `SavedIcp`'s doc comment in `prisma/schema.prisma` for
 * why: an ICP needs to be safely re-executed server-side later.
 */
import { z } from "zod";
import { CLIENT_DISCOVERY_SPECIALTIES, US_STATES } from "@destaworks/domain/constants";

export const createSavedIcpSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    taxonomy: z.enum(CLIENT_DISCOVERY_SPECIALTIES as [string, ...string[]]).nullish(),
    state: z.enum(US_STATES).nullish(),
    city: z.string().trim().max(100).nullish(),
    zip: z.string().trim().max(20).nullish(),
    isPrivate: z.boolean().optional(),
  })
  .strict();
export type CreateSavedIcpInput = z.infer<typeof createSavedIcpSchema>;

export interface SavedIcpDTO {
  id: string;
  name: string;
  taxonomy: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  isPrivate: boolean;
  userId: string;
  userName: string | null;
  createdAt: string; // ISO
}
