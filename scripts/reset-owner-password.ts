import "dotenv/config";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/prisma";

/**
 * TEMP dev helper — reset a login account's password (Better Auth's own hasher, so sign-in verifies).
 * Usage: NODE_OPTIONS=--conditions=react-server tsx scripts/reset-owner-password.ts <email> <password>
 */
async function main() {
  const email = process.argv[2] ?? "leliso@desta.works";
  const password = process.argv[3] ?? "DestaDev123!";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);
  const res = await prisma.account.updateMany({
    where: { userId: user.id, providerId: "credential" },
    data: { password: hashed },
  });

  console.log(
    res.count > 0
      ? `✓ Password reset for ${email} (role=${user.role})`
      : `⚠ ${email} has no credential account — no password to reset`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
