import type {
  DeleteTenantMemberResponse,
  GetTenantRolesResponse,
  PatchTenantMemberRoleResponse,
  TenantRoleResponse,
  UpsertAccessRoleInput,
  GetTenantMembersResponse,
  InviteMemberInput,
  PostTenantMemberResponse,
  PostTenantSwitchResponse,
} from "@destaworks/contracts/validation/tenant";
import { deleteJson, getJson, patchJson, postJson, type ApiResult } from "@/lib/api/client";

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

/** Change what a member may do here. On the MEMBERSHIP — the role that authorizes anything. */
export function changeMemberRole(
  membershipId: string,
  roleId: string,
): Promise<ApiResult<PatchTenantMemberRoleResponse>> {
  return patchJson<PatchTenantMemberRoleResponse>(
    `/api/tenants/members/${encodeURIComponent(membershipId)}/role`,
    { roleId },
  );
}

/**
 * The workspace's own roles.
 *
 * Every write here is re-checked server-side against the same four guards the editor shows: no
 * granting above yourself, a workspace keeps an administrator, built-ins survive, and a role in
 * use cannot be deleted. Nothing below is a permission check — it is a form.
 */
export function listRoles(): Promise<ApiResult<GetTenantRolesResponse>> {
  return getJson<GetTenantRolesResponse>("/api/tenants/roles");
}

export function createRole(input: UpsertAccessRoleInput): Promise<ApiResult<TenantRoleResponse>> {
  return postJson<TenantRoleResponse>("/api/tenants/roles", input);
}

export function updateRole(
  roleId: string,
  input: UpsertAccessRoleInput,
): Promise<ApiResult<TenantRoleResponse>> {
  return patchJson<TenantRoleResponse>(`/api/tenants/roles/${encodeURIComponent(roleId)}`, input);
}

export function deleteRole(roleId: string): Promise<ApiResult<{ id: string }>> {
  return deleteJson<{ id: string }>(`/api/tenants/roles/${encodeURIComponent(roleId)}`);
}
