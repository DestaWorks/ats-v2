import { describe, it, expect } from "vitest";
import { importInputSchema, importResumeSchema, MAX_IMPORT_RESUMES } from "./migration";

const BASE = { format: "csv" as const, content: "ID,Name\nL-1,Jane\n" };

describe("importResumeSchema", () => {
  it("accepts a valid resume entry", () => {
    const parsed = importResumeSchema.parse({
      filenamePrefix: "Jane Doe",
      originalFilename: "Jane Doe_resume.pdf",
      text: "resume text",
    });
    expect(parsed).toEqual({
      filenamePrefix: "Jane Doe",
      originalFilename: "Jane Doe_resume.pdf",
      text: "resume text",
    });
  });

  it("rejects an empty filenamePrefix, originalFilename, or text", () => {
    expect(() =>
      importResumeSchema.parse({ filenamePrefix: "", originalFilename: "a.pdf", text: "x" }),
    ).toThrow();
    expect(() =>
      importResumeSchema.parse({ filenamePrefix: "Jane", originalFilename: "", text: "x" }),
    ).toThrow();
    expect(() =>
      importResumeSchema.parse({
        filenamePrefix: "Jane",
        originalFilename: "a.pdf",
        text: "",
      }),
    ).toThrow();
  });

  it("rejects text over the 60k cap", () => {
    expect(() =>
      importResumeSchema.parse({
        filenamePrefix: "Jane",
        originalFilename: "a.pdf",
        text: "a".repeat(60_001),
      }),
    ).toThrow();
  });
});

describe("importInputSchema — resumes/extractWithAi (Wave 1.3 backlog)", () => {
  it("accepts a request with neither field — behaves exactly as before", () => {
    const parsed = importInputSchema.parse(BASE);
    expect(parsed.resumes).toBeUndefined();
    expect(parsed.extractWithAi).toBeUndefined();
  });

  it("accepts resumes + extractWithAi together", () => {
    const parsed = importInputSchema.parse({
      ...BASE,
      resumes: [
        { filenamePrefix: "Jane", originalFilename: "Jane_resume.pdf", text: "resume text" },
      ],
      extractWithAi: true,
    });
    expect(parsed.resumes).toHaveLength(1);
    expect(parsed.extractWithAi).toBe(true);
  });

  it("rejects more than MAX_IMPORT_RESUMES entries", () => {
    const resumes = Array.from({ length: MAX_IMPORT_RESUMES + 1 }, (_, i) => ({
      filenamePrefix: `Person ${i}`,
      originalFilename: `Person ${i}_resume.pdf`,
      text: "resume text",
    }));
    expect(() => importInputSchema.parse({ ...BASE, resumes })).toThrow();
  });

  it("rejects a malformed resume entry (missing text)", () => {
    expect(() =>
      importInputSchema.parse({
        ...BASE,
        resumes: [{ filenamePrefix: "Jane", originalFilename: "Jane_resume.pdf" }],
      }),
    ).toThrow();
  });

  it("rejects a malformed resume entry (missing originalFilename)", () => {
    expect(() =>
      importInputSchema.parse({
        ...BASE,
        resumes: [{ filenamePrefix: "Jane", text: "resume text" }],
      }),
    ).toThrow();
  });
});
