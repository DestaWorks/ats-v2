import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level field encryption for the heaviest PII/PHI columns (`licenseNumber`, résumé
 * `extractedText`/`extractedData`). AES-256-GCM (authenticated) with a random 96-bit IV per value.
 *
 * FORMAT: `enc:v1:` + base64(iv | tag | ciphertext). The version tag lets us rotate the scheme
 * later; the prefix is how reads tell an encrypted value apart from a legacy/demo PLAINTEXT one.
 *
 * ACTIVATE-BY-KEY (mirrors the AI/Google patterns): the key comes from `FIELD_ENCRYPTION_KEY`
 * (base64, 32 bytes). When it is UNSET, `encryptField` returns the plaintext unchanged — so with no
 * key configured behavior is byte-for-byte identical to today (dev/demo/CI are unaffected). Set the
 * key in staging/prod to turn encryption on for all NEW writes; existing plaintext rows keep reading
 * (the prefix check makes reads mixed-safe) and get encrypted the next time they are written.
 *
 * This lives at the repository boundary only — services and DTOs never see ciphertext, so the PII
 * gates in the DTO layer keep applying to the decrypted plaintext.
 */

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce (GCM recommended)
const TAG_BYTES = 16; // 128-bit auth tag

/**
 * Resolve the AES key from the environment, or `null` when unset (activate-by-key → passthrough).
 * Throws only when a key IS set but is not exactly 32 bytes — a misconfiguration we must not hide.
 */
function getKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256). Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

/**
 * Encrypt a plaintext string. With no key configured returns the input UNCHANGED (dev/demo). With a
 * key, returns `enc:v1:<base64(iv|tag|ciphertext)>`. Callers stringify non-string payloads (JSON)
 * before calling this.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // activate-by-key: no key → no-op passthrough
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypt a value produced by `encryptField`. A value WITHOUT the `enc:v1:` prefix is returned
 * as-is (legacy/demo plaintext, or a value written while the key was unset) — this is what makes
 * reads safe across a mixed table. A prefixed value with the key unset, or a tampered ciphertext,
 * throws (GCM auth failure).
 */
export function decryptField(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // plaintext legacy/demo row — passthrough
  const key = getKey();
  if (!key) {
    throw new Error("FIELD_ENCRYPTION_KEY is required to read an encrypted field but is not set.");
  }
  const buf = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Whether field encryption is active (a valid `FIELD_ENCRYPTION_KEY` is configured). JSON columns
 * use this to decide whether to stringify+encrypt (active) or store the native object (passthrough)
 * — a JSON value must NOT be stringified when encryption is off, or it round-trips object→string.
 */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/** `encryptField` that passes `null`/`undefined` through untouched (for optional columns). */
export function encryptNullable<T extends string | null | undefined>(value: T): T {
  return (value == null ? value : encryptField(value)) as T;
}

/** `decryptField` that passes `null`/`undefined` through untouched (for optional columns). */
export function decryptNullable<T extends string | null | undefined>(value: T): T {
  return (value == null ? value : decryptField(value)) as T;
}
