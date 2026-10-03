import { test, expect } from "@playwright/test";
import { storageConfigured } from "./fixtures/storage-setup";

const RESUME_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Refusals only. The happy path lives in `resume-upload.spec.ts`, which drives a browser against a
 * real object store — these cannot reach it, and for a long time nothing did.
 */

test("mints an upload URL when a blob store is configured", async ({ request }) => {
  const response = await request.post(`${RESUME_API_BASE}/resume/upload-url`, {
    data: { filename: "e2e-resume.pdf", mimeType: "application/pdf" },
  });

  if (!storageConfigured()) {
    // Well-formed and still unservable: the feature is activate-by-key.
    expect(response.status()).toBe(503);
    return;
  }

  expect(response.status()).toBe(200);
  const { signedUrl, storageKey } = (await response.json()) as {
    signedUrl: string;
    storageKey: string;
  };
  expect(storageKey).toBeTruthy();

  // A signed URL the browser cannot resolve is the same outage as no URL at all, and a checksum
  // query parameter makes the store reject the bytes the browser sends. Both shipped undetected.
  const url = new URL(signedUrl);
  expect(url.protocol, "the signed URL is addressable").toMatch(/^https?:$/);
  expect(
    [...url.searchParams.keys()].filter((key) => key.toLowerCase().includes("checksum")),
    "a presigned PUT must carry no checksum parameter",
  ).toEqual([]);
});

test("refuses an upload URL for a file type that is not allowed", async ({ request }) => {
  const response = await request.post(`${RESUME_API_BASE}/resume/upload-url`, {
    data: { filename: "e2e-resume.exe", mimeType: "application/x-msdownload" },
  });

  expect(response.status()).toBe(422);
});

test("refuses an upload URL with no filename", async ({ request }) => {
  const response = await request.post(`${RESUME_API_BASE}/resume/upload-url`, {
    data: { filename: "", mimeType: "application/pdf" },
  });

  expect(response.status()).toBe(422);
});

test("answers 404 for a document download that does not exist", async ({ request }) => {
  const response = await request.get(`${RESUME_API_BASE}/documents/does-not-exist/download-url`);

  expect(response.status()).toBe(404);
});
