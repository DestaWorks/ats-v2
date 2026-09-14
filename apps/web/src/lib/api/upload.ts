import { messageForFailure, postJson } from "./client";
import type { ResumeUploadUrlDTO } from "@destaworks/contracts/validation/resume";

/**
 * Upload one file to object storage: ask the API to sign a URL, then PUT the bytes at it.
 *
 * Centralised because three call sites had their own copy (the candidate resume tab, the resume
 * flow, the migration wizard) and the two halves are easy to get subtly wrong apart — the first
 * hop is a gated JSON call to our own API and belongs on `./client`, while the second is a raw PUT
 * to a signed storage URL that must NOT carry our envelope, our cookie, or a JSON content type.
 *
 * The returned `reason` is for a caller that reports per-file failures; the others ignore it.
 */
export type UploadResult =
  | { readonly ok: true; readonly storageKey: string }
  | { readonly ok: false; readonly reason: string };

export async function uploadToStorage(input: {
  filename: string;
  mimeType: string;
  body: Blob;
}): Promise<UploadResult> {
  const signed = await postJson<ResumeUploadUrlDTO>("/api/resume/upload-url", {
    filename: input.filename,
    mimeType: input.mimeType,
  });
  if (!signed.ok) return { ok: false, reason: messageForFailure(signed.failure) };

  try {
    const put = await fetch(signed.data.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: input.body,
    });
    if (!put.ok) return { ok: false, reason: `PUT ${put.status} ${put.statusText}` };
    return { ok: true, storageKey: signed.data.storageKey };
  } catch {
    return { ok: false, reason: "Couldn't reach storage. Check your connection and try again." };
  }
}
