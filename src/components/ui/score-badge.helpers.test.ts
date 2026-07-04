import { describe, expect, it } from "vitest";
import { HOT_SCORE } from "@/lib/constants";
import { isHot, scoreTone } from "./score-badge.helpers";

describe("scoreTone", () => {
  it("null → neutral (rendered muted, never '0%')", () => {
    expect(scoreTone(null)).toBe("neutral");
  });

  it("≥ 80 → success (green)", () => {
    expect(scoreTone(80)).toBe("success");
    expect(scoreTone(100)).toBe("success");
  });

  it("50–79 → amber", () => {
    expect(scoreTone(50)).toBe("amber");
    expect(scoreTone(79)).toBe("amber");
  });

  it("< 50 → neutral", () => {
    expect(scoreTone(49)).toBe("neutral");
    expect(scoreTone(0)).toBe("neutral"); // a real zero is a low score, not "no score"
  });
});

describe("isHot", () => {
  it("null → false", () => {
    expect(isHot(null)).toBe(false);
  });

  it("≥ HOT_SCORE → true", () => {
    expect(isHot(HOT_SCORE)).toBe(true);
    expect(isHot(100)).toBe(true);
  });

  it("below HOT_SCORE → false", () => {
    expect(isHot(HOT_SCORE - 1)).toBe(false);
    expect(isHot(0)).toBe(false);
  });
});
