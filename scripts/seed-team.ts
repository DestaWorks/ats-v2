import "dotenv/config";
import { auth } from "@destaworks/auth/auth";
import { prisma } from "@destaworks/db/prisma";
import { ROLE_CAPABILITIES } from "@destaworks/domain/constants";

/**
 * Seed a TEAM into the founding workspace, so roles and permissions can be exercised by hand.
 *
 * `seed-owner` makes one Owner, which is enough to sign in and nothing else: with a single
 * all-powerful account every guard is invisible. This adds a person per built-in role, two
 * pending invitations, and a custom role — the states the role editor and the member screen
 * actually have to handle.
 *
 * It also narrows the second workspace's plan, because a tenant that has bought everything can
 * never show the upsell that a tenant which has not is supposed to see.
 *
 * Idempotent: re-running updates nothing it did not create.
 */

const PASSWORD = process.env.SEED_TEAM_PASSWORD ?? "ChangeMe123!";
const TENANT_SLUG = process.env.SEED_TENANT_SLUG ?? "destaworks";

const TEAM = [
  { name: "Dana Director", email: "director@desta.local", role: "Director", status: "active" },
  { name: "Marcus Manager", email: "manager@desta.local", role: "Manager", status: "active" },
  { name: "Sara Screener", email: "screener@desta.local", role: "Screener", status: "active" },
  { name: "Alex Associate", email: "associate@desta.local", role: "Associate", status: "active" },
  { name: "Ada Admin", email: "admin@desta.local", role: "Admin", status: "active" },
  { name: "Pat Pending", email: "pending@desta.local", role: "Manager", status: "invited" },
  { name: "Ivy Invited", email: "invited@desta.local", role: "Screener", status: "invited" },
] as const;

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No workspace "${TENANT_SLUG}" — run seed-owner first.`);

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(PASSWORD);

  for (const person of TEAM) {
    const role = await prisma.accessRole.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: person.role } },
    });
    if (!role) throw new Error(`No role "${person.role}" in ${TENANT_SLUG}`);

    const user =
      (await prisma.user.findUnique({ where: { email: person.email } })) ??
      (await prisma.user.create({
        data: {
          name: person.name,
          email: person.email,
          emailVerified: true,
          // Better Auth gates its OWN admin endpoints on this column; it authorizes nothing here.
          role: role.capabilities.includes("manageUsers") ? "Owner" : "Associate",
        },
      }));

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    if (!account) {
      await prisma.account.create({
        data: {
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: hashed,
        },
      });
    }

    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        roleId: role.id,
        role: role.name,
        status: person.status,
      },
      update: {},
    });
    console.log(
      `  ${person.status === "invited" ? "invited" : "active "}  ${person.role.padEnd(10)} ${person.email}`,
    );
  }

  // A role the workspace invented — what the six built-ins cannot demonstrate on their own.
  const custom = await prisma.accessRole.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Recruiter" } },
    create: {
      tenantId: tenant.id,
      name: "Recruiter",
      capabilities: [...ROLE_CAPABILITIES.Screener, "viewReports"],
      templateKey: null,
      isBuiltIn: false,
    },
    update: {},
  });
  console.log(`\n  custom role: ${custom.name} (${custom.capabilities.length} permissions)`);

  // So one workspace can show the upsell and the other cannot.
  const other = await prisma.tenant.findFirst({ where: { slug: { not: TENANT_SLUG } } });
  if (other) {
    await prisma.tenant.update({
      where: { id: other.id },
      data: { plan: "starter", seatLimit: 3 },
    });
    console.log(`  ${other.slug}: plan=starter seatLimit=3 — Reports/CRM/Discovery will upsell`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
