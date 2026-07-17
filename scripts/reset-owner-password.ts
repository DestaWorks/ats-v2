import "dotenv/config";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/prisma";

/**
 * TEMP dev helper — reset a login account's password (Better Auth's own hasher, so sign-in verifies).
 * Usage: NODE_OPTIONS=--conditions=react-server tsx scripts/reset-owner-password.ts <email> <password>
 *
 * SECURITY (SECURITY-AUDIT-APP.md H4): `<email>`/`<password>` are REQUIRED — no more falling back
 * to a real-looking prod owner email + a hardcoded, now-git-history-public password. A missing
 * `<email>` (or a `NODE_ENV=production` run) refuses to proceed unless `FORCE_PROD_RESET=1` is set,
 * so a copy-paste mistake or a stray CLI invocation can't silently overwrite the real owner's
 * production password.
 */
async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error(
      "Usage: tsx scripts/reset-owner-password.ts <email> <password>\n" +
        "Both arguments are required — no default credentials (SECURITY-AUDIT-APP.md H4).",
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && process.env.FORCE_PROD_RESET !== "1") {
    console.error(
      "Refusing to reset a password against a production NODE_ENV without FORCE_PROD_RESET=1. " +
        "This script writes directly to the database, bypassing any review process — set the " +
        "env var explicitly if you really mean to run this against production.",
    );
    process.exit(1);
  }

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
