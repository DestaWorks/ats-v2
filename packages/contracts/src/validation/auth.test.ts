import { describe, it, expect } from "vitest";
import {
  signInSchema,
  accessRequestSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "./auth";

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

describe("requestPasswordResetSchema", () => {
  it("accepts a valid email", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejects a bad email", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching passwords ≥8 chars", () => {
    const r = resetPasswordSchema.safeParse({
      newPassword: "longenough",
      confirmPassword: "longenough",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a password under 8 characters", () => {
    const r = resetPasswordSchema.safeParse({ newPassword: "short", confirmPassword: "short" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === "Password must be at least 8 characters"),
      ).toBe(true);
    }
  });

  it("rejects mismatched passwords, attributed to confirmPassword", () => {
    const r = resetPasswordSchema.safeParse({
      newPassword: "longenough",
      confirmPassword: "different",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.message === "Passwords don't match");
      expect(issue?.path).toEqual(["confirmPassword"]);
    }
  });
});
