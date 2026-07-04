/**
 * Client-side PDF text extraction (Wave 1.2, design §7). Ports the legacy pdf.js flow
 * (`legacy/index.html` ~3192): read the file as an ArrayBuffer, `getDocument({data})`,
 * then concatenate `getTextContent()` across every page. Heavy PDF parsing stays on the
 * client — the server endpoint consumes plain text (the §1.2 text-mode contract).
 *
 * `pdfjs-dist` is a browser-only ESM module, so it is dynamically imported at call time
 * (never at module top-level) to keep it out of the SSR/server bundle. The text assembler
 * is split out as a pure, unit-testable function.
 */

/** How many characters of extracted text we ever send (legacy capped extraction ~60k). */
export const MAX_RESUME_TEXT_CHARS = 60_000;

/**
 * Pure: assemble one résumé text blob from per-page text-item strings.
 * Each page's items are space-joined (legacy `items.map(i => i.str).join(" ")`), pages are
 * separated by a blank line (legacy `pages.join("\n\n")`). Unit-tested in isolation.
 */
export function assembleResumeText(pageItemStrings: string[][]): string {
  return pageItemStrings.map((items) => items.join(" ")).join("\n\n");
}

/** Trim to the send cap without throwing on undefined. */
export function capResumeText(text: string): string {
  return text.length > MAX_RESUME_TEXT_CHARS ? text.slice(0, MAX_RESUME_TEXT_CHARS) : text;
}

let workerConfigured = false;

/**
 * Extract résumé text from a PDF File, client-side.
 *
 * Worker setup: we point `GlobalWorkerOptions.workerSrc` at the bundler-resolved worker
 * asset via `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`. This is the
 * pdf.js-recommended pattern for module bundlers and is resolved as a static asset by
 * Turbopack/webpack under Next 15 (no manual `public/` copy needed). If a future Next/
 * Turbopack change breaks asset URL resolution, the fallback is to copy that file into
 * `public/` and set `workerSrc = "/pdf.worker.min.mjs"`.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages: string[][] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")));
  }

  return capResumeText(assembleResumeText(pages));
}
