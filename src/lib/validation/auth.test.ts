import { describe, it, expect } from "vitest";
import { signInSchema, accessRequestSchema } from "./auth";

describe("signInSchema", () => {
  it("accepts a valid email + password", () => {
    const r = signInSchema.safeParse({ email: "leliso@desta.works", password: "secret" });
    expect(r.success).toBe(true);
  });

  it("rejects a bad email with a message", () => {
    const r = signInSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Enter a valid email address")).toBe(true);
    }
  });

  it("rejects an empty password", () => {
    const r = signInSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Password is required")).toBe(true);
    }
  });
});

describe("accessRequestSchema", () => {
  it("accepts name + email, org/message optional", () => {
    expect(accessRequestSchema.safeParse({ name: "Sam", email: "s@x.com" }).success).toBe(true);
  });

  it("requires a name", () => {
    expect(accessRequestSchema.safeParse({ name: "", email: "s@x.com" }).success).toBe(false);
  });
});
