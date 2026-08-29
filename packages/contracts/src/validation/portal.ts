/**
 * Client Portal contract (Wave 4.3) — isomorphic types + zod for the public `/portal` surface and
 * its admin-management counterpart. `Portal*DTO`s are deliberately ALLOW-LIST projections (list
 * every field explicitly), not omit-based — legacy's `portal_data` sent full candidate/role rows
 * minus a 3-column denylist, leaking email/phone/licenseNumber/resume URLs/internal notes to the
 * browser regardless of what the UI rendered. An allow-list can't leak a field nobody remembered
 * to deny.
 */
import { z } from "zod";
import {
  CREDENTIALS,
  POPULATIONS,
  ROLE_PRIORITIES,
  SETTINGS,
  US_STATES,
} from "@destaworks/domain/constants";

// --- Public portal data (read) ----------------------------------------------

export interface PortalCandidateDTO {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
  status: string; // friendly label, not the raw code
  city: string | null;
  state: string | null;
  yearsExp: number | null;
  employer: string | null;
}

export interface PortalRoleDTO {
  id: string;
  title: string;
  credential: string | null;
  state: string | null;
  city: string | null;
  setting: string | null;
  rate: string | null;
  description: string | null;
  priority: string;
  status: string;
  openedAt: string; // ISO
}

export interface PortalDataDTO {
  client: { name: string };
  contact: { fullName: string };
  candidates: PortalCandidateDTO[];
  roles: PortalRoleDTO[];
}

// --- Log a portal view (write) -----------------------------------------------

/**
 * The pages a portal view may be logged against — an allow-list, because `page` is the only value
 * an external caller supplies that reaches an audit row, and an unbounded string would let a client
 * write whatever it liked into the audit trail.
 */
export const PORTAL_VIEW_PAGES = ["portal"] as const;

export const portalLogViewSchema = z.object({ page: z.enum(PORTAL_VIEW_PAGES) }).strict();
export type PortalLogViewInput = z.infer<typeof portalLogViewSchema>;

// --- Post a role (write) -----------------------------------------------------

/** Same shape as `createOpenRoleSchema` minus `clientId`/`status` — both server-set from the
 *  resolved portal contact, never from the request body. */
export const postPortalRoleSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    credential: z.enum(CREDENTIALS).nullish(),
    state: z.enum(US_STATES).nullish(),
    city: z.string().trim().max(120).nullish(),
    setting: z.enum(SETTINGS).nullish(),
    population: z.enum(POPULATIONS).nullish(),
    rate: z.string().trim().max(120).nullish(),
    description: z.string().trim().max(4000).nullish(),
    priority: z.enum(ROLE_PRIORITIES).default("P2"),
  })
  .strict();
export type PostPortalRoleInput = z.infer<typeof postPortalRoleSchema>;

// --- Request access (public, unauthenticated) --------------------------------

export const portalAccessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(200),
    requestedClientName: z.string().trim().min(1).max(200),
    note: z.string().trim().max(2000).nullish(),
  })
  .strict();
export type PortalAccessRequestInput = z.infer<typeof portalAccessRequestSchema>;

export interface PortalAccessRequestDTO {
  id: string;
  name: string;
  email: string;
  requestedClientName: string;
  note: string | null;
  status: string;
  createdAt: string; // ISO
}

/** The admin-facing queue of portal-access requests — every submitted request. */
export interface PortalAccessRequestListDTO {
  requests: PortalAccessRequestDTO[];
}

export const approvePortalRequestSchema = z
  .object({
    clientId: z.string().trim().min(1),
    /** Link to an existing contact; omit to create a new one from the request's name/email. */
    contactId: z.string().trim().min(1).nullish(),
  })
  .strict();
export type ApprovePortalRequestInput = z.infer<typeof approvePortalRequestSchema>;

// --- Admin-facing portal-access management ------------------------------------

export interface AdminPortalTokenDTO {
  id: string;
  createdAt: string; // ISO
  expiresAt: string; // ISO
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AdminPortalContactDTO {
  id: string;
  fullName: string;
  email: string | null;
  portalEnabled: boolean;
  activeToken: AdminPortalTokenDTO | null;
}

/** Result of generating a link — the plaintext token is returned exactly once. */
export interface GeneratedPortalLinkDTO {
  contact: AdminPortalContactDTO;
  token: string;
}

/**
 * Response body of `POST /api/portal/roles` — the new role's id, and nothing else.
 *
 * Written as a literal rather than reusing `OpenRoleEnvelope` ON PURPOSE. This surface answers
 * people OUTSIDE the company, so a later widening of the internal role DTO must not be able to
 * widen what the portal returns. The narrow shape is the guarantee; sharing the internal envelope
 * would silently trade it away the next time a field is added.
 */
export interface PostPortalRoleResponse {
  role: { id: string };
}

/**
 * Response body of `GET /portal/data` — exactly `PortalDataDTO`, the allow-list projection above.
 *
 * An alias rather than a fresh shape on purpose: the projection IS the guarantee, and a second
 * definition here would be a place for the two to drift apart in the direction that leaks.
 */
export type GetPortalDataResponse = PortalDataDTO;

/**
 * Response body of `POST /portal/log-view` — an acknowledgement and nothing else. The caller
 * already knows who it is; echoing the contact or the client back would only widen the surface.
 */
export interface PostPortalLogViewResponse {
  ok: true;
}
