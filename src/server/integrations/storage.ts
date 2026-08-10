import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "@/server/http/app-error";

/**
 * Object storage client (Wave 6, D8: no file/image bytes in the database) — speaks the standard
 * S3 protocol via the AWS SDK rather than any one vendor's proprietary SDK, so swapping providers
 * later (Supabase Storage → real AWS S3 → Cloudflare R2 → Backblaze B2 → self-hosted MinIO, all
 * S3-compatible) is a credentials/endpoint change only, never a code change — same "swap the
 * provider, not the code" posture as `AI_MODEL` (`server/ai/config.ts`). Supabase Storage itself
 * exposes an S3-compatible endpoint (`https://<project-ref>.supabase.co/storage/v1/s3`), so this
 * targets that today.
 *
 * Mirrors `apollo.ts`/`hunter.ts`'s "activate-by-key" convention — every function throws
 * `AppError("FEATURE_DISABLED")` until the S3 credentials are set, so avatar/resume uploads
 * degrade to a clear "not configured" error rather than a crash.
 */

export const AVATAR_BUCKET = "avatars";
export const RESUME_BUCKET = "resumes";

export const storageEnabled: boolean = Boolean(
  process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
);

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!storageEnabled) {
    throw new AppError("FEATURE_DISABLED", "Object storage is not configured");
  }
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      // Path-style addressing (`endpoint/bucket/key`) — required by Supabase and most non-AWS
      // S3-compatible providers; real AWS S3 accepts it too.
      forcePathStyle: true,
    });
  }
  return client;
}

/** Upload bytes to a PUBLIC bucket (avatars) and return the permanent public URL. There's no
 *  protocol-level "public URL" in S3 itself — every provider constructs it differently (Supabase's
 *  own REST path, a bucket's virtual-hosted URL, a CDN domain in front of R2, …) — so the base is
 *  explicit config (`S3_PUBLIC_URL_BASE`), not derived. */
export async function uploadPublic(
  bucket: string,
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const s3 = getClient();
  try {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
  } catch {
    throw new AppError("UPSTREAM_ERROR", "Could not upload the file");
  }
  const base = process.env.S3_PUBLIC_URL_BASE;
  if (!base) throw new AppError("UPSTREAM_ERROR", "No public URL base configured for storage");
  return `${base.replace(/\/$/, "")}/${bucket}/${key}`;
}

/** A short-lived URL the browser can PUT raw bytes to directly (resumes never pass through our
 *  own server — avoids Vercel's serverless body-size limit for multi-MB PDFs). A standard S3
 *  presigned PUT — works identically against any S3-compatible provider, no vendor-specific token. */
export async function createSignedUploadUrl(
  bucket: string,
  key: string,
): Promise<{ signedUrl: string }> {
  const s3 = getClient();
  try {
    const signedUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 300,
    });
    return { signedUrl };
  } catch {
    throw new AppError("UPSTREAM_ERROR", "Could not create an upload URL");
  }
}

/** A fresh, short-lived download URL for a PRIVATE bucket (resumes) — generated on demand, never
 *  persisted, since a persisted signed URL would silently go stale once it expires. A standard S3
 *  presigned GET. */
export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const s3 = getClient();
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  } catch {
    throw new AppError("UPSTREAM_ERROR", "Could not create a download URL");
  }
}
