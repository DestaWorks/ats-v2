import { describe, expect, it } from "vitest";
import {
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_MIME_TYPES,
  requestResumeUploadUrlSchema,
  resumeUploadMimeType,
} from "./resume";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("resume upload allowlist", () => {
  it("accepts the formats real resumes arrive as", () => {
    expect(resumeUploadMimeType("Alemitu Bekele.pdf")).toBe("application/pdf");
    expect(resumeUploadMimeType("Marcus Trent.docx")).toBe(DOCX);
    expect(resumeUploadMimeType("Priya Raman.doc")).toBe("application/msword");
    expect(resumeUploadMimeType("notes.txt")).toBe("text/plain");
  });

  it("matches on the extension regardless of case, and ignores earlier dots", () => {
    expect(resumeUploadMimeType("RESUME.DOCX")).toBe(DOCX);
    expect(resumeUploadMimeType("dawit.haile.v2.pdf")).toBe("application/pdf");
  });

  it("rejects anything else, including an extensionless name", () => {
    expect(resumeUploadMimeType("resume")).toBeUndefined();
    expect(resumeUploadMimeType("payload.exe")).toBeUndefined();
    expect(resumeUploadMimeType("scan.png")).toBeUndefined();
  });

  it("is the gate the presigned PUT enforces", () => {
    for (const mimeType of RESUME_UPLOAD_MIME_TYPES) {
      expect(requestResumeUploadUrlSchema.safeParse({ filename: "r.pdf", mimeType }).success).toBe(
        true,
      );
    }
    expect(
      requestResumeUploadUrlSchema.safeParse({ filename: "r.png", mimeType: "image/png" }).success,
    ).toBe(false);
  });

  it("offers every allowed type to the file picker", () => {
    for (const mimeType of RESUME_UPLOAD_MIME_TYPES) {
      expect(RESUME_UPLOAD_ACCEPT).toContain(mimeType);
    }
    expect(RESUME_UPLOAD_ACCEPT).toContain(".docx");
  });
});
