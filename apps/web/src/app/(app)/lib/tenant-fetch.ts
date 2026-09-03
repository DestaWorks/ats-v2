import type {
  DeleteTenantMemberResponse,
  GetTenantMembersResponse,
  InviteMemberInput,
  PostTenantMemberResponse,
  PostTenantSwitchResponse,
} from "@destaworks/contracts/validation/tenant";
import { deleteJson, getJson, postJson, type ApiResult } from "@/lib/api/client";

export { messageForFailure } from "@/lib/api/client";
export type { ApiFailure, FieldIssue } from "@/lib/api/client";

/**
 * Workspace switching and membership, from the browser.
 *
 * Switching is a POST rather than a link because the server sets the `dw_tenant` cookie from the
 * membership it just verified — the client never writes it. That is the whole security property:
 * the cookie carries a slug the SERVER resolved, and every later request re-checks it as a claim.
 */
export function switchTenant(slug: string): Promise<ApiResult<PostTenantSwitchResponse>> {
  return postJson<PostTenantSwitchResponse>("/api/tenants/switch", { tenant: slug });
}

export function acceptInvitation(slug: string): Promise<ApiResult<PostTenantSwitchResponse>> {
  return postJson<PostTenantSwitchResponse>("/api/tenants/members/accept", { tenant: slug });
}

export function listMembers(): Promise<ApiResult<GetTenantMembersResponse>> {
  return getJson<GetTenantMembersResponse>("/api/tenants/members");
}

export function inviteMember(
  input: InviteMemberInput,
): Promise<ApiResult<PostTenantMemberResponse>> {
  return postJson<PostTenantMemberResponse>("/api/tenants/members", input);
}

export function removeMember(membershipId: string): Promise<ApiResult<DeleteTenantMemberResponse>> {
  return deleteJson<DeleteTenantMemberResponse>(
    `/api/tenants/members/${encodeURIComponent(membershipId)}`,
  );
}
