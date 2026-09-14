import { describe, expect, it } from "vitest";
import { assembleResumeText, capResumeText, MAX_RESUME_TEXT_CHARS } from "./pdf-extract";

describe("assembleResumeText", () => {
  it("space-joins items within a page and blank-line-joins pages (legacy flow)", () => {
    expect(
      assembleResumeText([
        ["Jane", "Doe", "PMHNP-BC"],
        ["Experience", "St.", "Mary's"],
      ]),
    ).toBe("Jane Doe PMHNP-BC\n\nExperience St. Mary's");
  });

  it("returns an empty string for no pages", () => {
    expect(assembleResumeText([])).toBe("");
  });

  it("keeps empty pages as blank separators", () => {
    expect(assembleResumeText([["a"], [], ["b"]])).toBe("a\n\n\n\nb");
  });
});

describe("capResumeText", () => {
  it("leaves short text untouched", () => {
    expect(capResumeText("hello")).toBe("hello");
  });

  it("truncates text over the send cap", () => {
    const long = "x".repeat(MAX_RESUME_TEXT_CHARS + 500);
    expect(capResumeText(long)).toHaveLength(MAX_RESUME_TEXT_CHARS);
  });
});
