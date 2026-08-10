import "dotenv/config";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";

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
 */

const BUCKETS = ["avatars", "resumes"] as const;

async function main() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
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
    "Done. If your provider doesn't mark buckets public/private via this API, set " +
      "'avatars' to public and 'resumes' to private in its dashboard now.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
