import { dbUnscoped, type AnyTx } from "../tenant-scope";
import { REFERENCE_ROWS_CAP } from "../query-limits";
import type { AccessRoleRow } from "./membership.repository";

/**
 * Data access for `AccessRole` — the roles a TENANT owns.
 *
 * Global for the same reason as `membership.repository.ts`: a role row is read to BUILD a context,
 * before one exists. Every method takes `tenantId` and puts it in the predicate. The structural
 * guarantee is in the schema — `memberships.(roleId, tenantId)` references
 * `access_roles.(id, tenantId)`, so a cross-tenant assignment cannot be written regardless.
 */

const ACCESS_ROLE_SELECT = {
  id: true,
  name: true,
  capabilities: true,
  templateKey: true,
  isBuiltIn: true,
} as const;

export const accessRoleRepository = {
  /** Every role this tenant owns, built-ins first, then custom roles alphabetically. */
  listByTenant(tenantId: string, tx?: AnyTx): Promise<AccessRoleRow[]> {
    return dbUnscoped(tx).accessRole.findMany({
      where: { tenantId },
      select: ACCESS_ROLE_SELECT,
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
      take: REFERENCE_ROWS_CAP,
    });
  },

  /** One role, constrained to the tenant the caller was verified in. */
  findByIdInTenant(tenantId: string, id: string, tx?: AnyTx): Promise<AccessRoleRow | null> {
    return dbUnscoped(tx).accessRole.findFirst({
      where: { id, tenantId },
      select: ACCESS_ROLE_SELECT,
    });
  },

  /** One role by name — how a seed or an invitation names a built-in without knowing its id. */
  findByNameInTenant(tenantId: string, name: string, tx?: AnyTx): Promise<AccessRoleRow | null> {
    return dbUnscoped(tx).accessRole.findUnique({
      where: { tenantId_name: { tenantId, name } },
      select: ACCESS_ROLE_SELECT,
    });
  },

  /**
   * What the last-administrator check counts. By CAPABILITY, not by role name — a tenant may
   * rename "Owner" or build a custom role that administers.
   */
  countActiveWithCapability(tenantId: string, capability: string, tx?: AnyTx): Promise<number> {
    return dbUnscoped(tx).membership.count({
      where: {
        tenantId,
        status: "active",
        accessRole: { capabilities: { has: capability } },
      },
    });
  },

  /** How many members hold this role — what a delete has to refuse on. */
  countMembers(tenantId: string, roleId: string, tx?: AnyTx): Promise<number> {
    return dbUnscoped(tx).membership.count({ where: { tenantId, roleId } });
  },

  create(
    input: {
      tenantId: string;
      name: string;
      capabilities: readonly string[];
      templateKey: string | null;
      isBuiltIn: boolean;
    },
    tx?: AnyTx,
  ): Promise<AccessRoleRow> {
    return dbUnscoped(tx).accessRole.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        capabilities: [...input.capabilities],
        templateKey: input.templateKey,
        isBuiltIn: input.isBuiltIn,
      },
      select: ACCESS_ROLE_SELECT,
    });
  },

  /** `tenantId` is in the predicate, so another workspace's id matches nothing. */
  async update(
    tenantId: string,
    id: string,
    data: { name?: string; capabilities?: readonly string[] },
    tx?: AnyTx,
  ): Promise<AccessRoleRow | null> {
    const { count } = await dbUnscoped(tx).accessRole.updateMany({
      where: { id, tenantId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.capabilities !== undefined && { capabilities: [...data.capabilities] }),
      },
    });
    if (count === 0) return null;
    return accessRoleRepository.findByIdInTenant(tenantId, id, tx);
  },

  /** Delete a role. The composite FK refuses while anyone still holds it. */
  async deleteInTenant(tenantId: string, id: string, tx?: AnyTx): Promise<boolean> {
    const { count } = await dbUnscoped(tx).accessRole.deleteMany({ where: { id, tenantId } });
    return count > 0;
  },

  /**
   * Clone the built-in templates. Idempotent, so a template added in a later release lands on
   * existing workspaces without disturbing what a customer has edited.
   */
  async seedForTenant(
    tenantId: string,
    templates: readonly { name: string; capabilities: readonly string[] }[],
    tx?: AnyTx,
  ): Promise<void> {
    await dbUnscoped(tx).accessRole.createMany({
      data: templates.map((t) => ({
        tenantId,
        name: t.name,
        capabilities: [...t.capabilities],
        templateKey: t.name,
        isBuiltIn: true,
      })),
      skipDuplicates: true,
    });
  },
};
