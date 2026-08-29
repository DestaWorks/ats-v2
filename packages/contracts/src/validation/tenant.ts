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

/**
 * Why a platform admin suspended a tenant — a closed vocabulary, never free text.
 *
 * The reason is written into the SUSPENDED TENANT'S OWN `activity_log`, where its auditors read
 * it. Free text there is an open channel into a customer's audit trail: an operator pasting "spoke
 * to Dr Abebe, 251-91-…" would put a third party's PII somewhere no PII rule reaches. A closed set
 * also makes the trail filterable, which is what an operator actually wants from it.
 */
export const TENANT_SUSPENSION_REASONS = [
  "nonpayment",
  "abuse",
  "security",
  "customer-request",
  "trial-expired",
  "other",
] as const;
export type TenantSuspensionReason = (typeof TENANT_SUSPENSION_REASONS)[number];

/** `POST /platform/tenants/:slug/suspend` — take a workspace offline for everyone in it. */
export const suspendTenantSchema = z.object({ reason: z.enum(TENANT_SUSPENSION_REASONS) }).strict();
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;

/** How much attention a tenant needs. `critical` means someone is already locked out or unpaid. */
export type TenantHealthLevel = "ok" | "warning" | "critical";

/**
 * The individual things wrong with a tenant, as codes rather than sentences so the console can
 * group and filter them and so the set is the same in every language.
 */
export const TENANT_HEALTH_SIGNALS = [
  "suspended",
  "trial-expired",
  "no-active-members",
  "over-seat-limit",
  "at-seat-limit",
  "trial-ending-soon",
] as const;
export type TenantHealthSignal = (typeof TENANT_HEALTH_SIGNALS)[number];

/** Seat usage against the plan's limit. `limit: null` is an uncapped plan, not a limit of zero. */
export interface TenantSeatsDTO {
  used: number;
  limit: number | null;
  overLimit: boolean;
}

/** Trial state, present only while `trialEndsAt` is set. Negative days would be meaningless, so
 *  an elapsed trial reports zero remaining and says so with `expired`. */
export interface TenantTrialDTO {
  endsAt: string; // ISO
  daysRemaining: number;
  expired: boolean;
}

/**
 * Everything needed to answer "is this tenant OK" without a database — the done-when of Phase 8.
 *
 * Derived entirely from the tenant's own registry row plus its active member count, so the whole
 * list costs the same two queries no matter how many tenants there are.
 */
export interface TenantHealthDTO {
  level: TenantHealthLevel;
  /** Most severe first. Empty when the level is `ok`. */
  signals: TenantHealthSignal[];
  seats: TenantSeatsDTO;
  trial: TenantTrialDTO | null;
}

/** A tenant as the PLATFORM plane sees it: operational metadata only, never its contents. */
export interface PlatformTenantDTO {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  memberCount: number;
  createdAt: string; // ISO
  health: TenantHealthDTO;
}

/**
 * One tenant read from outside it — the list's fields plus the one signal that needs a query
 * inside the workspace.
 *
 * `lastActivityAt` is the most recent `activity_log` entry, which answers "is anyone actually
 * using this" better than any registry column can. It is a timestamp and nothing else: no actor,
 * no entity, no payload, because the platform plane must not be able to read a tenant's contents
 * on the way to reporting its health.
 */
export interface PlatformTenantDetailDTO extends PlatformTenantDTO {
  lastActivityAt: string | null;
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
  tenant: PlatformTenantDetailDTO;
}

export interface PostPlatformTenantSuspendResponse {
  tenant: PlatformTenantDTO;
}

export interface PostPlatformTenantRestoreResponse {
  tenant: PlatformTenantDTO;
}
