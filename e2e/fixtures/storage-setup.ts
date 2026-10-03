import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";

/** The buckets `packages/integrations/src/storage.ts` writes to. SeaweedFS does not create them. */
const BUCKETS = ["avatars", "resumes", "exports"];

export function storageConfigured(): boolean {
  return Boolean(
    process.env["S3_ENDPOINT"] &&
    process.env["S3_ACCESS_KEY_ID"] &&
    process.env["S3_SECRET_ACCESS_KEY"],
  );
}

/**
 * Create the buckets the upload specs need, once, before the servers start.
 *
 * Storage is OPTIONAL for the suite: a developer running `pnpm e2e` without the object-store
 * container still gets every other spec. It is MANDATORY in CI, where `E2E_REQUIRE_STORAGE=1`
 * turns a missing store into a loud failure rather than a silently skipped upload test — the whole
 * point of adding it is that the upload path stopped being exercised at all.
 */
export async function prepareStorage(): Promise<void> {
  if (!storageConfigured()) {
    if (process.env["E2E_REQUIRE_STORAGE"] === "1") {
      throw new Error(
        "E2E_REQUIRE_STORAGE=1 but S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not all set. " +
          "The upload specs would skip, which is how the upload path went untested before.",
      );
    }
    return;
  }

  const endpoint = process.env["S3_ENDPOINT"] ?? "";
  const accessKeyId = process.env["S3_ACCESS_KEY_ID"] ?? "";
  const secretAccessKey = process.env["S3_SECRET_ACCESS_KEY"] ?? "";

  const s3 = new S3Client({
    endpoint,
    region: process.env["S3_REGION"] ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    // Mirrors the application client: the SDK default adds a CRC32 trailer that non-AWS stores
    // reject. Kept in step so the fixture cannot pass while the app's own client fails.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  for (const Bucket of BUCKETS) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : String(error);
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(name)) {
        throw new Error(`Could not create the "${Bucket}" bucket for the E2E run: ${name}`);
      }
    }
  }
}
