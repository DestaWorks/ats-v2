import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "./http/app-error";

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
/** PRIVATE, like `resumes` — generated report CSVs hold candidate PII and are never public. */
export const EXPORT_BUCKET = "exports";

/*
 * ---------------------------------------------------------------------------------------------
 * KEY SCOPING (SAAS-RESTRUCTURE-PLAN 6.6)
 * ---------------------------------------------------------------------------------------------
 *
 * WHY A KEY NEEDS A SCOPE IN IT
 *
 * A bucket is one flat namespace shared by every tenant. Before this, a resume lived at
 * `<uuid>-<filename>.pdf` and an export at `candidates/<exportId>.csv` — keys derived from an id
 * and nothing else. Two consequences, both bad:
 *
 *  - Whoever knows or guesses a key can name an object belonging to anyone. The signed-URL layer
 *    is the only thing between a key and the bytes, and it signs whatever key it is handed.
 *  - Ids are unique per table, not per bucket, and Phase 7's ETL will mint ids from a different
 *    generator than the app's `cuid()`. A collision writes one tenant's PDF over another's.
 *
 * So a key must name its owner. Two owners exist, matching the two scopes in the data model:
 *
 *  `t/<tenantId>/…`  tenant-scoped — resumes, exports, anything hanging off a tenant-scoped row.
 *  `u/<userId>/…`    user-scoped — avatars. `User` is a GLOBAL model (`@destaworks/db`'s
 *                    `GLOBAL_MODELS`): one human, one login, many tenants, and therefore one
 *                    avatar that is not any tenant's property. A tenant prefix here would be a
 *                    lie, and would duplicate the file per membership.
 *
 * The one-letter discriminator is what makes the two spaces disjoint, so a tenant id can never
 * collide with a user id even though both are `cuid()`s from the same alphabet.
 *
 * The scheme is enforced by the type system, not by convention: the upload functions take a
 * `ScopedStorageKey`, which only the constructors below can produce, so a bare string does not
 * compile.
 *
 * MIGRATION PATH FOR OBJECTS THAT ALREADY EXIST — nothing is broken by this change
 *
 *  1. Reads are unaffected. `getSignedDownloadUrl` takes the wider `PersistedStorageKey`, which
 *     `persistedStorageKey()` mints from whatever string a row already holds. Every existing
 *     `Document.storageKey` and `ReportExport.storageKey` keeps resolving byte-for-byte.
 *  2. Every write names an owner. There is no un-owned constructor left: the two sites that could
 *     not name a tenant while 6.5 was outstanding — the resume upload and the report export — now
 *     both do, so the only way to write a key is through `tenantStorageKey` or `userStorageKey`.
 *  3. Backfill, once 6.2 has given every row a tenant (Phase 7 work, not this phase): for each
 *     row holding an un-prefixed key, S3 `CopyObject` to `t/<tenantId>/<old key>`, UPDATE the row
 *     to the new key, then `DeleteObject` on the old one. In that order — a crash between any two
 *     steps leaves the object readable at one of the two keys, never at neither.
 *  4. When no row holds an un-prefixed key, `persistedStorageKey` gets a `startsWith` check and
 *     the legacy shape stops being representable at all.
 *
 * Avatars are the one case with no backfill step. Their public URL is persisted on `User.image`
 * and keeps pointing at the object it always did; the next upload writes `u/<id>/avatar.jpg` and
 * updates the column. Old objects are orphaned, not broken, and a sweep of `avatars` for keys
 * without a `u/` prefix can delete them whenever convenient.
 */

declare const SCOPED_KEY: unique symbol;
declare const PERSISTED_KEY: unique symbol;

/**
 * A key that already exists in a bucket, whatever shape it has.
 *
 * The read path accepts this: keys written before scoping existed are still perfectly good keys,
 * and refusing them would break every resume uploaded to date.
 */
export type PersistedStorageKey = string & { readonly [PERSISTED_KEY]: true };

/**
 * A key that names its owner. Only the constructors below produce one, and only these may be
 * WRITTEN — which is what stops the un-scoped shape from spreading to new objects.
 */
export type ScopedStorageKey = PersistedStorageKey & { readonly [SCOPED_KEY]: true };

/** Rejects the ways a path segment can escape its prefix or collapse it. */
function assertSegment(segment: string): void {
  if (segment.length === 0 || segment === "." || segment === "..") {
    throw new AppError("BAD_REQUEST", "Invalid storage key segment");
  }
  if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) {
    throw new AppError("BAD_REQUEST", "Invalid storage key segment");
  }
}

function buildKey(prefix: string, owner: string, segments: readonly string[]): ScopedStorageKey {
  assertSegment(owner);
  if (segments.length === 0) throw new AppError("BAD_REQUEST", "Storage key needs a name");
  for (const segment of segments) assertSegment(segment);
  // The brand is a compile-time marker with no runtime representation, so constructing a branded
  // value is necessarily an assertion. It is sound here because this function IS the rule the
  // brand stands for: every segment has been validated above.
  return `${prefix}/${owner}/${segments.join("/")}` as ScopedStorageKey;
}

/** A key owned by one tenant: `t/<tenantId>/<…>`. The shape every tenant-scoped object uses. */
export function tenantStorageKey(tenantId: string, ...segments: string[]): ScopedStorageKey {
  return buildKey("t", tenantId, segments);
}

/** A key owned by one user: `u/<userId>/<…>`. For objects hanging off a GLOBAL model, which today
 *  means avatars and nothing else. */
export function userStorageKey(userId: string, ...segments: string[]): ScopedStorageKey {
  return buildKey("u", userId, segments);
}

/**
 * A key read back out of the database, taken at face value.
 *
 * Read-only by construction: this returns the wide `PersistedStorageKey`, which the upload
 * functions do not accept, so a stored legacy key can be downloaded but never re-written in place.
 */
export function persistedStorageKey(key: string): PersistedStorageKey {
  // Branding an existing key, which by definition already satisfies whatever rule was in force
  // when it was written. The narrowing to a prefix check lands with the Phase 7 backfill.
  return key as PersistedStorageKey;
}

const s3Endpoint = process.env.S3_ENDPOINT;
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

export const storageEnabled: boolean = Boolean(s3Endpoint && s3AccessKeyId && s3SecretAccessKey);

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey) {
    throw new AppError("FEATURE_DISABLED", "Object storage is not configured");
  }
  if (!client) {
    client = new S3Client({
      endpoint: s3Endpoint,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
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
  key: ScopedStorageKey,
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

/** Upload bytes to a PRIVATE bucket and return nothing — deliberately no URL, because a private
 *  object has no durable address: the only way to read it back is `getSignedDownloadUrl`, minted
 *  per request and short-lived. Server-side counterpart to `createSignedUploadUrl` for the case
 *  where the bytes are produced on the server (a job's CSV) rather than by the browser. */
export async function uploadPrivate(
  bucket: string,
  key: ScopedStorageKey,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const s3 = getClient();
  try {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
  } catch {
    throw new AppError("UPSTREAM_ERROR", "Could not upload the file");
  }
}

/** A short-lived URL the browser can PUT raw bytes to directly (resumes never pass through our
 *  own server — avoids Vercel's serverless body-size limit for multi-MB PDFs). A standard S3
 *  presigned PUT — works identically against any S3-compatible provider, no vendor-specific token.
 *  `contentType` is signed into the URL, so S3 rejects a PUT whose Content-Type header doesn't
 *  match — the caller must validate it against an allowlist first (this function only enforces
 *  whatever it's given). */
export async function createSignedUploadUrl(
  bucket: string,
  key: ScopedStorageKey,
  contentType: string,
): Promise<{ signedUrl: string }> {
  const s3 = getClient();
  try {
    const signedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 300 },
    );
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
  key: PersistedStorageKey,
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
