import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proves the field-crypto boundary: AES-256-GCM round-trip with a key; PLAINTEXT PASSTHROUGH on a
 * read of a non-prefixed (legacy/demo) value; NO-OP write when the key is unset (activate-by-key);
 * and a tampered ciphertext failing the GCM auth check. No DB, no network.
 */

vi.mock("server-only", () => ({}));

// A deterministic 32-byte key (base64) for the round-trip cases.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

async function loadFresh() {
  vi.resetModules();
  return import("./field-crypto");
}

const originalKey = process.env.FIELD_ENCRYPTION_KEY;

beforeEach(() => {
  delete process.env.FIELD_ENCRYPTION_KEY;
});
afterEach(() => {
  if (originalKey === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = originalKey;
});

describe("field-crypto", () => {
  it("round-trips a value with a key set (ciphertext is prefixed and opaque)", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const { encryptField, decryptField } = await loadFresh();
    const plaintext = "RN-1234567";
    const enc = encryptField(plaintext);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain(plaintext);
    expect(decryptField(enc)).toBe(plaintext);
  });

  it("produces a distinct ciphertext each call (random IV) but decrypts to the same value", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const { encryptField, decryptField } = await loadFresh();
    const a = encryptField("NPI-999");
    const b = encryptField("NPI-999");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("NPI-999");
    expect(decryptField(b)).toBe("NPI-999");
  });

  it("returns a non-prefixed (legacy/demo plaintext) value as-is on read", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const { decryptField } = await loadFresh();
    expect(decryptField("legacy-plaintext-license")).toBe("legacy-plaintext-license");
  });

  it("no-ops on write when the key is unset (identical to today)", async () => {
    const { encryptField, decryptField } = await loadFresh();
    const enc = encryptField("SECRET-42");
    expect(enc).toBe("SECRET-42"); // passthrough
    expect(decryptField(enc)).toBe("SECRET-42");
  });

  it("throws on a tampered ciphertext (GCM auth failure)", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const { encryptField, decryptField } = await loadFresh();
    const enc = encryptField("do-not-tamper");
    // Flip the last base64 char of the payload to corrupt the ciphertext/tag.
    const last = enc.slice(-1) === "A" ? "B" : "A";
    const tampered = enc.slice(0, -1) + last;
    expect(() => decryptField(tampered)).toThrow();
  });

  it("passes null/undefined through the nullable helpers untouched", async () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
    const { encryptNullable, decryptNullable } = await loadFresh();
    expect(encryptNullable(null)).toBeNull();
    expect(encryptNullable(undefined)).toBeUndefined();
    expect(decryptNullable(null)).toBeNull();
    const enc = encryptNullable("x");
    expect(typeof enc).toBe("string");
    expect(decryptNullable(enc)).toBe("x");
  });
});
