import "dotenv/config";
import { auth } from "@destaworks/auth/auth";
import { prisma } from "@destaworks/db/prisma";
import { ROLES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";

/**
 * Seed the first workspace and its Owner. Public signup is disabled (DECISIONS D3), so both are
 * created directly: hash the password with Better Auth's own hasher, then insert the Tenant, the
 * User, its credential Account, and the Membership that grants the role.
 *
 * The MEMBERSHIP is what makes the account usable. Since Phase 6, `getCurrentUser()` resolves the
 * active tenant and reads the role from that membership — a user row alone resolves to no tenant
 * and every guarded page answers 401. `User.role` authorizes nothing here.
 *
 * It is still written for one reason: Better Auth's admin plugin gates each of its own endpoints
 * on `session.user.role`, so a seeded Owner with a null column would be refused by the plugin on
 * the admin screen even though the membership grants `manageUsers`. Seeding it is what keeps that
 * surface usable until those endpoints are replaced (SAAS-RESTRUCTURE-PLAN 6.4).
 *
 * Idempotent on both halves, so re-running it against a seeded database is a no-op.
 *
 * Configure via env (recommended) or accept the dev defaults:
 *   SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_NAME, SEED_TENANT_SLUG, SEED_TENANT_NAME
 */
async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@desta.local";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_OWNER_NAME ?? "Owner";
  // Matches `20260829112000_tenants_backfill`, which mints this workspace and moves every
  // pre-tenancy user into it — so a seeded database and a migrated one name the same workspace.
  const slug = process.env.SEED_TENANT_SLUG ?? "destaworks";
  const tenantName = process.env.SEED_TENANT_NAME ?? "Desta Works";

  const tenant =
    (await prisma.tenant.findUnique({ where: { slug } })) ??
    (await prisma.tenant.create({ data: { slug, name: tenantName, status: "active" } }));
  console.log(`✓ Workspace: ${tenant.name} (${tenant.slug})`);

  // Roles are rows a workspace owns, so a workspace with none cannot hold a member at all.
  // Idempotent, so re-seeding an existing tenant adds only what is missing.
  await prisma.accessRole.createMany({
    data: ROLES.map((roleName) => ({
      tenantId: tenant.id,
      name: roleName,
      capabilities: [...ROLE_CAPABILITIES[roleName]],
      templateKey: roleName,
      isBuiltIn: true,
    })),
    skipDuplicates: true,
  });
  const ownerRole = await prisma.accessRole.findUniqueOrThrow({
    where: { tenantId_name: { tenantId: tenant.id, name: "Owner" } },
  });
  console.log(`✓ Seeded ${ROLES.length} built-in roles`);

  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: { name, email, emailVerified: true, role: "Owner" },
    }));

  if (!existing) {
    const ctx = await auth.$context;
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: await ctx.password.hash(password),
      },
    });
    console.log(`✓ Seeded Owner: ${email}`);
  } else {
    console.log(`↷ User ${email} already exists. Password unchanged.`);
  }

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership) {
    console.log(`↷ Membership already exists (role=${membership.role}).`);
    return;
  }
  await prisma.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      roleId: ownerRole.id,
      role: ownerRole.name,
      status: "active",
    },
  });
  console.log(`✓ Owner membership in ${tenant.slug}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
