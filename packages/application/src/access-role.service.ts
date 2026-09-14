import { writeAudit } from "@destaworks/db/audit";
import { accessRoleRepository } from "@destaworks/db/tenancy/access-role.repository";
import type { AccessRoleRow } from "@destaworks/db/tenancy/membership.repository";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import {
  CAPABILITIES,
  hasCapability,
  ROLES,
  ROLE_CAPABILITIES,
  toCapabilities,
  type Capability,
} from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";
import { AppError } from "@destaworks/integrations/http/app-error";
import type {
  AccessRoleDTO,
  GetTenantRolesResponse,
  TenantRoleResponse,
  UpsertAccessRoleInput,
} from "@destaworks/contracts/validation/tenant";

/**
 * Roles as a workspace owns them — the service behind the role editor. Every other service SPENDS
 * authority; this one defines it, so four guards are not optional:
 *
 *  1. A workspace keeps someone who can administer it — counted by who HOLDS `manageUsers`, since
 *     a tenant may rename its roles or invent new ones.
 *  2. You may only grant what you hold, or anyone with `manageRoles` edits themselves upward.
 *  3. A new role is a CLONE, never blank — the documented cure for role explosion.
 *  4. `list` returns capabilities and member counts together, so "why can't Sarah see reports?"
 *     is answerable from the screen.
 *
 * Built-ins are editable (the defaults are ours, the workspace is theirs) but not deletable: a
 * workspace with no roles cannot invite anyone, and `templateKey` is how a later migration finds
 * a tenant's copy of "Owner".
 */

const ADMINISTRATIVE_CAPABILITY: Capability = "manageUsers";

function toDTO(row: AccessRoleRow, memberCount: number): AccessRoleDTO {
  return {
    id: row.id,
    name: row.name,
    capabilities: [...toCapabilities(row.capabilities)],
    templateKey: row.templateKey,
    isBuiltIn: row.isBuiltIn,
    memberCount,
  };
}

/** DEFINING a role is `manageRoles` — the escalation surface, never the broader `manageUsers`. */
function requireRoleManagement(ctx: TenantContext): void {
  if (!hasCapability(ctx, "manageRoles")) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
}

/**
 * READING the list is weaker on purpose: choosing a role is half of inviting someone, so anyone
 * who may invite has to see the options.
 */
function requireRoleVisibility(ctx: TenantContext): void {
  if (!hasCapability(ctx, "manageUsers") && !hasCapability(ctx, "manageRoles")) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
}

/**
 * Reject rather than drop. Reading drops unknown codes so a stale row degrades safely; writing is
 * the opposite — discarding part of a save would show a role granting less than what was saved.
 */
function validateCapabilities(requested: readonly string[]): readonly Capability[] {
  const known = new Set<string>(CAPABILITIES);
  const unknown = requested.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    throw new AppError("BAD_REQUEST", `Unknown permission: ${unknown[0] ?? ""}`);
  }
  return [...new Set(requested)] as readonly Capability[];
}

/** Guard 2: nobody may define a role granting more than they themselves hold. */
function requireMayGrant(ctx: TenantContext, capabilities: readonly Capability[]): void {
  const beyond = capabilities.filter((c) => !ctx.capabilities.includes(c));
  if (beyond.length > 0) {
    throw new AppError("FORBIDDEN", "You can't grant access that you don't have yourself");
  }
}

/** Only counts when the change REMOVES administration, so an ordinary edit costs no extra query. */
async function requireWorkspaceKeepsAnAdministrator(
  ctx: TenantContext,
  role: AccessRoleRow,
  willStillAdminister: boolean,
): Promise<void> {
  const administersNow = role.capabilities.includes(ADMINISTRATIVE_CAPABILITY);
  if (!administersNow || willStillAdminister) return;

  const holders = await accessRoleRepository.countMembers(ctx.tenantId, role.id);
  if (holders === 0) return;

  const administrators = await accessRoleRepository.countActiveWithCapability(
    ctx.tenantId,
    ADMINISTRATIVE_CAPABILITY,
  );
  if (administrators <= holders) {
    throw new AppError("CONFLICT", "A workspace must keep at least one member who can manage it");
  }
}

export const accessRoleService = {
  /** Every role this workspace owns, with what it grants and how many people hold it. */
  async list(ctx: TenantContext): Promise<GetTenantRolesResponse> {
    requireRoleVisibility(ctx);
    const rows = await accessRoleRepository.listByTenant(ctx.tenantId);
    const counts = await Promise.all(
      rows.map((row) => accessRoleRepository.countMembers(ctx.tenantId, row.id)),
    );
    return { roles: rows.map((row, i) => toDTO(row, counts[i] ?? 0)) };
  },

  /** The built-ins as SHIPPED — a clone should start from a known-good default, not an edited copy. */
  templates(): { name: string; capabilities: readonly Capability[] }[] {
    return ROLES.map((name) => ({ name, capabilities: ROLE_CAPABILITIES[name] }));
  },

  /** Guard 3: a new role is a CLONE. `capabilities` arrives pre-filled from a template. */
  async create(ctx: TenantContext, input: UpsertAccessRoleInput): Promise<TenantRoleResponse> {
    requireRoleManagement(ctx);
    const capabilities = validateCapabilities(input.capabilities);
    requireMayGrant(ctx, capabilities);

    const clash = await accessRoleRepository.findByNameInTenant(ctx.tenantId, input.name);
    if (clash !== null) {
      throw new AppError("CONFLICT", "A role with that name already exists in this workspace");
    }

    const created = await withTenantTransaction(ctx, async (tx) => {
      const row = await accessRoleRepository.create(
        {
          tenantId: ctx.tenantId,
          name: input.name,
          capabilities,
          templateKey: null,
          isBuiltIn: false,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "access_role",
        entityId: row.id,
        actor: ctx.user.id,
        action: "create_role",
        tenantId: ctx.tenantId,
        after: { name: row.name, capabilities: row.capabilities },
      });
      return row;
    });

    return { role: toDTO(created, 0) };
  },

  /** Rename a role or change what it grants. Built-ins included — the defaults are only defaults. */
  async update(
    ctx: TenantContext,
    roleId: string,
    input: UpsertAccessRoleInput,
  ): Promise<TenantRoleResponse> {
    requireRoleManagement(ctx);
    const capabilities = validateCapabilities(input.capabilities);
    requireMayGrant(ctx, capabilities);

    const role = await accessRoleRepository.findByIdInTenant(ctx.tenantId, roleId);
    if (role === null) throw new AppError("NOT_FOUND", "No such role in this workspace");

    await requireWorkspaceKeepsAnAdministrator(
      ctx,
      role,
      capabilities.includes(ADMINISTRATIVE_CAPABILITY),
    );

    if (input.name !== role.name) {
      const clash = await accessRoleRepository.findByNameInTenant(ctx.tenantId, input.name);
      if (clash !== null && clash.id !== role.id) {
        throw new AppError("CONFLICT", "A role with that name already exists in this workspace");
      }
    }

    const updated = await withTenantTransaction(ctx, async (tx) => {
      const row = await accessRoleRepository.update(
        ctx.tenantId,
        roleId,
        { name: input.name, capabilities },
        tx,
      );
      if (row === null) throw new AppError("NOT_FOUND", "No such role in this workspace");
      await writeAudit(tx, {
        entity: "access_role",
        entityId: row.id,
        actor: ctx.user.id,
        action: "update_role",
        tenantId: ctx.tenantId,
        before: { name: role.name, capabilities: role.capabilities },
        after: { name: row.name, capabilities: row.capabilities },
      });
      return row;
    });

    const memberCount = await accessRoleRepository.countMembers(ctx.tenantId, roleId);
    return { role: toDTO(updated, memberCount) };
  },

  /**
   * Refused while anyone holds it — the composite FK would refuse anyway, but a 409 naming the
   * count is a better answer than a constraint violation.
   */
  async remove(ctx: TenantContext, roleId: string): Promise<{ id: string }> {
    requireRoleManagement(ctx);

    const role = await accessRoleRepository.findByIdInTenant(ctx.tenantId, roleId);
    if (role === null) throw new AppError("NOT_FOUND", "No such role in this workspace");
    if (role.isBuiltIn) {
      throw new AppError("CONFLICT", "Built-in roles can be edited but not deleted");
    }

    const holders = await accessRoleRepository.countMembers(ctx.tenantId, roleId);
    if (holders > 0) {
      throw new AppError(
        "CONFLICT",
        `${holders} member${holders === 1 ? "" : "s"} still hold this role — move them to another role first`,
      );
    }

    await withTenantTransaction(ctx, async (tx) => {
      await accessRoleRepository.deleteInTenant(ctx.tenantId, roleId, tx);
      await writeAudit(tx, {
        entity: "access_role",
        entityId: roleId,
        actor: ctx.user.id,
        action: "delete_role",
        tenantId: ctx.tenantId,
        before: { name: role.name, capabilities: role.capabilities },
      });
    });

    return { id: roleId };
  },
};
