/**
 * Seed a PLATFORM operator — a user with no tenant membership.
 *
 * The platform plane authorizes by user id from the environment, never by a row, so this account
 * deliberately joins no workspace: it cannot act inside a tenant, appears on no roster, and cannot
 * be granted anything from inside the app. Print the id so it can be put in
 * `PLATFORM_ADMIN_USER_IDS` — creating the account grants nothing on its own.
 */
import { prisma } from "@destaworks/db/prisma";
import { auth } from "@destaworks/auth/auth";

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL ?? "platform@desta.local";
  const name = process.env.PLATFORM_ADMIN_NAME ?? "Platform Operator";
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({ data: { name, email, emailVerified: true, role: "Associate" } }));

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
    console.log(`✓ Created platform operator: ${email}`);
  } else {
    console.log(`↷ ${email} already exists. Password unchanged.`);
  }

  const memberships = await prisma.membership.count({ where: { userId: user.id } });
  console.log(`✓ Tenant memberships: ${memberships} (expected 0)`);
  console.log(`\nPLATFORM_ADMIN_USER_IDS entry:\n${user.id}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
