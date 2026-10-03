import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";
import { storageConfigured } from "./fixtures/storage-setup";

/**
 * The one flow the suite never exercised: a recruiter attaching a resume in a browser.
 *
 * Everything else about resumes is asserted at the API, and all of it is refusals — so on
 * 2026-10-03 four separate faults shipped to staging together while 288 specs stayed green:
 * the SDK adding a CRC32 trailer SeaweedFS rejects, the store running out of per-bucket volumes,
 * a signed URL pointing at a Docker-internal hostname, and a CSP with no storage origin. Each is
 * invisible to a Node request and visible to a browser, which is why this spec drives the browser.
 *
 * It needs a real object store. `E2E_REQUIRE_STORAGE=1` in CI turns a missing one into a failure
 * rather than a skip, because a silently skipped upload test is how the gap opened in the first
 * place.
 */

const RESUME_API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test.skip(!storageConfigured(), "object storage is not configured for this run");

/** A real, structurally valid one-page PDF — pdf.js parses it rather than hanging on a stub. */
function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 14 Tf 20 80 Td (${text}) Tj ET`;
  const bodies = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 150]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>stream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  bodies.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${bodies.length + 1}/Root 1 0 R>>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function attachResume(
  page: import("@playwright/test").Page,
  candidateId: string,
  filename: string,
  bytes: Buffer,
): Promise<void> {
  await gotoReady(page, `/candidates/${candidateId}`);
  await page.getByRole("tab", { name: /Resume/ }).click();
  await page
    .getByLabel("Choose a resume file")
    .setInputFiles({ name: filename, mimeType: "application/pdf", buffer: bytes });
}

test("attaches a resume in the browser and the stored file is previewable", async ({
  page,
  request,
}) => {
  // pdf.js compiles on first use under `next dev`, and the upload itself is three round trips.
  test.setTimeout(120_000);

  const stamp = Date.now();
  const filename = `e2e-resume-${stamp}.pdf`;
  const bytes = minimalPdf(`E2E Resume ${stamp}`);
  const candidateId = await createCandidate(request, `E2E Upload ${stamp}`);

  await attachResume(page, candidateId, filename, bytes);

  await expect(page.getByText(`${filename} uploaded`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(filename).first()).toBeVisible();

  // The assertion that would have caught every fault above: a row with no stored object renders
  // "No file stored" and is not clickable. A green toast beside that label means the app claimed
  // success for a file it never stored.
  await expect(page.getByText("No file stored")).toHaveCount(0);
});

test("a resume attached in the browser comes back byte-for-byte through a signed URL", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const stamp = Date.now();
  const filename = `e2e-roundtrip-${stamp}.pdf`;
  const bytes = minimalPdf(`E2E Roundtrip ${stamp}`);
  const candidateId = await createCandidate(request, `E2E Roundtrip ${stamp}`);

  await attachResume(page, candidateId, filename, bytes);
  await expect(page.getByText(`${filename} uploaded`)).toBeVisible({ timeout: 60_000 });

  const response = await request.get(`${RESUME_API}/candidates/${candidateId}/detail`);
  expect(response.ok(), "GET /candidates/:id/detail").toBeTruthy();
  const { detail } = (await response.json()) as {
    detail: { documents: { id: string; originalFilename: string; storageKey: string | null }[] };
  };

  const stored = detail.documents.find((doc) => doc.originalFilename === filename);
  if (!stored) throw new Error(`${filename} is not listed on the candidate after upload`);
  // Null here is the phantom row: metadata saved, bytes never stored.
  expect(stored.storageKey, "the document carries a storage key").toBeTruthy();

  const signed = await request.get(`${RESUME_API}/documents/${stored.id}/download-url`);
  expect(signed.ok(), "GET /documents/:id/download-url").toBeTruthy();
  const { url } = (await signed.json()) as { url: string };

  // Fetched without a session, exactly as the browser does: a signed URL carries its own auth.
  const fetched = await page.request.get(url);
  expect(fetched.status(), "the signed download URL serves the object").toBe(200);
  expect(Buffer.from(await fetched.body()).equals(bytes), "bytes survive the round trip").toBe(
    true,
  );
});
