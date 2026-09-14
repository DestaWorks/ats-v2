import { describe, it, expect } from "vitest";
import { LEARN_CHAPTERS, updateLearnProgressSchema } from "./learn";

describe("updateLearnProgressSchema", () => {
  it("accepts a real chapter id with done true or false", () => {
    expect(updateLearnProgressSchema.parse({ chapterId: "overview", done: true }).done).toBe(true);
    expect(updateLearnProgressSchema.parse({ chapterId: "weekly-brief", done: false }).done).toBe(
      false,
    );
  });

  it("rejects a chapterId that isn't in LEARN_CHAPTERS", () => {
    expect(() =>
      updateLearnProgressSchema.parse({ chapterId: "made-up-chapter", done: true }),
    ).toThrow();
  });

  it("rejects a missing done", () => {
    expect(() => updateLearnProgressSchema.parse({ chapterId: "overview" })).toThrow();
  });

  it("rejects a non-boolean done", () => {
    expect(() =>
      updateLearnProgressSchema.parse({ chapterId: "overview", done: "true" }),
    ).toThrow();
  });

  it("rejects unknown keys (.strict())", () => {
    expect(() =>
      updateLearnProgressSchema.parse({ chapterId: "overview", done: true, extra: 1 }),
    ).toThrow();
  });

  it("has exactly 8 chapters with unique ids", () => {
    expect(LEARN_CHAPTERS).toHaveLength(8);
    expect(new Set(LEARN_CHAPTERS.map((c) => c.id)).size).toBe(8);
  });
});
