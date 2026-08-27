import { describe, it, expect } from "vitest";
import { expiryDaysColor, licenseDotClass } from "./status-style";

describe("licenseDotClass", () => {
  it("is green for Active, red for Expired, orange otherwise", () => {
    expect(licenseDotClass("Active")).toBe("bg-green");
    expect(licenseDotClass("Expired")).toBe("bg-red");
    expect(licenseDotClass("Not Verified")).toBe("bg-orange");
  });
});

describe("expiryDaysColor", () => {
  it("is red at and under 30 days left", () => {
    expect(expiryDaysColor(0)).toBe("bg-red");
    expect(expiryDaysColor(30)).toBe("bg-red");
    expect(expiryDaysColor(-15)).toBe("bg-red"); // already expired
  });

  it("is orange between 31 and 180 days left", () => {
    expect(expiryDaysColor(31)).toBe("bg-orange");
    expect(expiryDaysColor(180)).toBe("bg-orange");
  });

  it("is green beyond 180 days left", () => {
    expect(expiryDaysColor(181)).toBe("bg-green");
    expect(expiryDaysColor(365)).toBe("bg-green");
  });
});
