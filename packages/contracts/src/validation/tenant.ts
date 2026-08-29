/**
 * Tenancy contract (SAAS-RESTRUCTURE-PLAN 6.5/6.8) — the request and response shapes of the
 * tenant switcher, the membership lifecycle, and the platform plane.
 *
 * Two rules govern what appears here:
 *
 *  - No response is a database row. `MembershipRow` carries a joined tenant and raw lifecycle
 *    strings; what crosses the wire is the narrow projection below.
 *  - No response carries PII beyond what its own gate already justifies. The switcher
 *    (`TenantChoiceDTO`) names workspaces and never people; the roster (`TenantMemberDTO`) names
 *    people and is reachable only with `manageUsers`, which is the same bar the existing admin
 *    user list clears.
 */
import { z } from "zod";
import { isTenantSlug, normaliseTenantSlug, ROLES } from "@destaworks/domain/constants";

/**
 * A tenant slug arriving in a request BODY — the switcher and the accept-invitation call.
 *
 * Normalised before validation so `Acme` and ` acme ` reach the database as the one canonical form
 * the URL forms already produce, and rejected by exactly the same predicate the path/subdomain
 * reader uses. A second, looser definition of "valid slug" here is how a value that the URL reader
 * refuses gets in through the body instead.
 */
export const tenantSlugSchema = z
  .string()
  .trim()
  .max(63)
  .transform(normaliseTenantSlug)
  .refine(isTenantSlug, { message: "Not a valid workspace name" });

/** `POST /tenants/switch` — make a tenant the active one for this browser. */
export const switchTenantSchema = z.object({ tenant: tenantSlugSchema }).strict();
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;

/** `POST /tenants/members/accept` — the invitee accepts their own pending invitation. */
export const acceptInvitationSchema = z.object({ tenant: tenantSlugSchema }).strict();
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * `POST /tenants/members` — invite an existing account into the active tenant.
 *
 * `role` is the membership's role, which is why it is accepted at all: it is a per-tenant fact,
 * not a property of the person. The invite cannot create an account — see `membership.service.ts`
 * for why account creation stays on one path.
 */
export const inviteMemberSchema = z
  .object({
    email: z.string().trim().email().max(200),
    role: z.enum(ROLES),
  })
  .strict();
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/** One workspace in the switcher. Names the tenant and this user's standing in it, nothing else. */
export interface TenantChoiceDTO {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  /** `active` is switchable; `invited` needs accepting first. */
  status: string;
}

/** One member of the active tenant. Behind `manageUsers`; the roster is the point of the screen. */
export interface TenantMemberDTO {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string; // ISO
}

/** A tenant as the PLATFORM plane sees it: operational metadata only, never its contents. */
export interface PlatformTenantDTO {
  id: string;
  slug: string;
  name: string;
  status: string;
  memberCount: number;
}

export interface GetTenantsResponse {
  tenants: TenantChoiceDTO[];
}

export interface PostTenantSwitchResponse {
  tenant: TenantChoiceDTO;
}

export interface GetTenantMembersResponse {
  members: TenantMemberDTO[];
}

export interface PostTenantMemberResponse {
  member: TenantMemberDTO;
}

export interface PostTenantMemberAcceptResponse {
  tenant: TenantChoiceDTO;
}

export interface DeleteTenantMemberResponse {
  member: TenantMemberDTO;
}

export interface GetPlatformTenantsResponse {
  tenants: PlatformTenantDTO[];
}

export interface GetPlatformTenantResponse {
  tenant: PlatformTenantDTO;
}
