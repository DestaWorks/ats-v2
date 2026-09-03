import "dotenv/config";
import { auth } from "@destaworks/auth/auth";
import { prisma } from "@destaworks/db/prisma";

/**
 * Seed a SECOND workspace and its own Owner — `seed-owner.ts`'s twin, not a rewrite of it.
 *
 * `seed-owner.ts` alone leaves exactly one tenant in the database, which is enough for every
 * single-tenant flow but not for the ones that only exist because more than one tenant can: the
 * `/choose-workspace` picker, a real cross-tenant invite → accept, the header
 * `WorkspaceSwitcher`, and the platform-admin tenants console (which has nothing to list with
 * one). There is no application code path that creates a tenant — 6.8 deliberately gives that
 * power to nobody — so a second one for local/e2e use has to be seeded the same direct way the
 * first one is.
 *
 * Idempotent on both halves, so re-running it against a seeded database is a no-op.
 *
 * Configure via env (recommended) or accept the dev/e2e defaults:
 *   SEED_TENANT_B_SLUG, SEED_TENANT_B_NAME,
 *   SEED_TENANT_B_OWNER_EMAIL, SEED_TENANT_B_OWNER_PASSWORD, SEED_TENANT_B_OWNER_NAME
 */
async function main() {
  const slug = process.env.SEED_TENANT_B_SLUG ?? "e2e-tenant-b";
  const tenantName = process.env.SEED_TENANT_B_NAME ?? "E2E Second Workspace";
  const email = process.env.SEED_TENANT_B_OWNER_EMAIL ?? "owner-b@e2e.local";
  const password = process.env.SEED_TENANT_B_OWNER_PASSWORD ?? "E2eOwnerBPass123!";
  const name = process.env.SEED_TENANT_B_OWNER_NAME ?? "Owner B";

  const tenant =
    (await prisma.tenant.findUnique({ where: { slug } })) ??
    (await prisma.tenant.create({ data: { slug, name: tenantName, status: "active" } }));
  console.log(`✓ Workspace: ${tenant.name} (${tenant.slug})`);

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
    data: { tenantId: tenant.id, userId: user.id, role: "Owner", status: "active" },
  });
  console.log(`✓ Owner membership in ${tenant.slug}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
