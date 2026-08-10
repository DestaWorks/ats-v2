import "dotenv/config";
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * One-off setup for object storage (Wave 6, D8) — creates the two buckets `server/integrations/
 * storage.ts` uploads to, via the standard S3 protocol (works against Supabase Storage's
 * S3-compatible endpoint today, or any other S3-compatible provider later). Run once per
 * environment (`pnpm setup:storage`) after setting the `S3_*` env vars. Idempotent — re-running
 * against buckets that already exist is a no-op, not an error.
 *
 * Bucket-level PUBLIC/PRIVATE access isn't a standardized S3 protocol concept (every provider
 * configures it its own way — Supabase via a dashboard toggle, AWS via a bucket policy, R2 via a
 * custom domain) — this script creates the buckets; making `avatars` publicly readable is a
 * one-time manual step in the provider's dashboard if `CreateBucketCommand` alone doesn't cover it.
 *
 * VERIFIED GOTCHA (2026-08-10, live Supabase test): a bucket's public/private toggle can silently
 * fail to save on the first attempt in the Supabase dashboard — the badge looked right until a
 * hard refresh proved it hadn't actually persisted, for BOTH buckets, in both directions. This
 * script closes that gap itself: after creation it uploads a real object to each bucket and
 * probes S3_PUBLIC_URL_BASE to confirm `avatars` is actually publicly readable and `resumes` is
 * actually blocked — never just trust the dashboard's badge.
 */

const BUCKETS = ["avatars", "resumes"] as const;

async function main() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const publicUrlBase = process.env.S3_PUBLIC_URL_BASE;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error("S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must all be set.");
    process.exit(1);
  }

  const s3 = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  for (const bucket of BUCKETS) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`✓ Bucket created: ${bucket}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already (exists|owned)/i.test(message)) {
        console.log(`✓ Bucket already exists: ${bucket}`);
      } else {
        throw err;
      }
    }
  }

  console.log(
    "\nBuckets ready — now go mark 'avatars' PUBLIC and confirm 'resumes' stays PRIVATE via " +
      "the provider's dashboard (Storage → bucket → Edit bucket). Come back and press Enter to " +
      "verify it actually took effect (don't trust the dashboard badge alone — it can lag).",
  );
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
  process.stdin.pause();

  if (!publicUrlBase) {
    console.log("S3_PUBLIC_URL_BASE isn't set — skipping the public/private verification.");
    return;
  }

  const key = "setup-verify.txt";
  for (const bucket of BUCKETS) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from("verify"),
        ContentType: "text/plain",
      }),
    );
  }
  const [avatarsRes, resumesRes] = await Promise.all([
    fetch(`${publicUrlBase.replace(/\/$/, "")}/avatars/${key}`),
    fetch(`${publicUrlBase.replace(/\/$/, "")}/resumes/${key}`),
  ]);
  await Promise.all(
    BUCKETS.map((bucket) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))),
  );

  const avatarsOk = avatarsRes.status === 200;
  const resumesBlocked = resumesRes.status !== 200;
  console.log(
    `avatars publicly readable: ${avatarsOk ? "✓ yes" : `✗ NO (status ${avatarsRes.status}) — fix in the dashboard and re-run`}`,
  );
  console.log(
    `resumes correctly private: ${resumesBlocked ? "✓ yes" : "⚠ NO — IT IS PUBLIC, fix this before storing any real resume"}`,
  );
  if (!avatarsOk || !resumesBlocked) process.exit(1);
  console.log("\n✓ Verified live — object storage is correctly configured.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
