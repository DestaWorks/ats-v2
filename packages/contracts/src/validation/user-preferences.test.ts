import { describe, it, expect } from "vitest";
import { updatePreferencesSchema } from "./user-preferences";

describe("updatePreferencesSchema — Wave 5.4 profile fields", () => {
  it("accepts bio/phone/location together with the existing fields", () => {
    const parsed = updatePreferencesSchema.parse({
      bio: "Recruiter for clinical roles.",
      phone: "+251 911 000 000",
      location: "Addis Ababa, Ethiopia",
    });
    expect(parsed).toMatchObject({
      bio: "Recruiter for clinical roles.",
      phone: "+251 911 000 000",
      location: "Addis Ababa, Ethiopia",
    });
  });

  it("trims whitespace on the new fields", () => {
    const parsed = updatePreferencesSchema.parse({ bio: "  hello  " });
    expect(parsed.bio).toBe("hello");
  });

  it("allows null to clear a field", () => {
    const parsed = updatePreferencesSchema.parse({ phone: null });
    expect(parsed.phone).toBeNull();
  });

  it("rejects a bio over 1000 chars", () => {
    expect(() => updatePreferencesSchema.parse({ bio: "a".repeat(1001) })).toThrow();
  });

  it("rejects a phone over 50 chars", () => {
    expect(() => updatePreferencesSchema.parse({ phone: "1".repeat(51) })).toThrow();
  });

  it("rejects a location over 200 chars", () => {
    expect(() => updatePreferencesSchema.parse({ location: "a".repeat(201) })).toThrow();
  });

  it("still rejects an empty body (.refine — at least one field)", () => {
    expect(() => updatePreferencesSchema.parse({})).toThrow();
  });

  it("still rejects unknown keys (.strict())", () => {
    expect(() => updatePreferencesSchema.parse({ bio: "hi", nickname: "x" })).toThrow();
  });
});
