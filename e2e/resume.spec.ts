import { test, expect } from "@playwright/test";

const RESUME_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("refuses an upload URL when no blob store is configured", async ({ request }) => {
  const response = await request.post(`${RESUME_API_BASE}/resume/upload-url`, {
    data: { filename: "e2e-resume.pdf", mimeType: "application/pdf" },
  });

  // No object store runs in the harness — the request is well-formed and still cannot be served.
  expect(response.status()).toBe(503);
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
