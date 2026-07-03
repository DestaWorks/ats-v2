import "dotenv/config";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/prisma";

/**
 * Seed the first Owner account. Public signup is disabled (DECISIONS D3), so the first
 * user is created directly: hash the password with Better Auth's own hasher and insert
 * the User + credential Account. Idempotent (skips if the email already exists).
 *
 * Configure via env (recommended) or accept the dev defaults:
 *   SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_NAME
 */
async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@desta.local";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_OWNER_NAME ?? "Owner";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`↷ User ${email} already exists (role=${existing.role}). Skipping.`);
    return;
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);

  const user = await prisma.user.create({
    data: { name, email, emailVerified: true, role: "Owner" },
  });
  await prisma.account.create({
    data: {
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: hashed,
    },
  });

  console.log(`✓ Seeded Owner: ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
