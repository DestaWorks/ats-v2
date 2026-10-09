import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";

/**
 * Field-encryption round-trip at the document repository boundary (B1 regression guard). The bug:
 * with NO `FIELD_ENCRYPTION_KEY`, `extractedData` (a JSON object) was stringify+passthrough'd,
 * round-tripping object→string and permanently corrupting the shape. This asserts BOTH key states:
 * no key → native object stored + read back as an object; with a key → `enc:v1:` string stored +
 * decrypted back to the object (and `extractedText` string encrypted/decrypted).
 */

const { create, findMany } = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../prisma", () => {
  const prisma: Record<string, unknown> = { document: { create, findMany } };
  // The seam builds its client with `prisma.$extends(...)`. Returning the fake unchanged keeps
  // these assertions about the query the REPOSITORY composes; that the extension then adds the
  // tenant filter is proven against real Prisma in `tenant-scope.test.ts`.
  prisma["$extends"] = () => prisma;
  return { prisma, db: (tx?: unknown) => tx ?? prisma };
});

import { documentRepository } from "./document.repository";

// The mocked DB echoes back exactly what the repo asked to store (so we see storage + read).
function echoStore() {
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "d1",
    extractedText: data.extractedText ?? null,
    extractedData: data.extractedData ?? null,
    deletedAt: null,
  }));
}

beforeEach(() => {
  create.mockReset();
  findMany.mockReset().mockResolvedValue([]);
  echoStore();
  delete process.env.FIELD_ENCRYPTION_KEY;
});
afterEach(() => {
  delete process.env.FIELD_ENCRYPTION_KEY;
});

const doc = { originalFilename: "r.pdf", mimeType: "application/pdf" };

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  modules: MODULES,
  capabilities: ROLE_CAPABILITIES.Owner,
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("documentRepository field encryption", () => {
  it("NO key: stores extractedData as a NATIVE object (not a string) and reads it back as an object", async () => {
    const data = { snapshot: "x", licensure: [{ number: "L1" }] };
    const row = await documentRepository.create(ctx, {
      ...doc,
      extractedText: "plain",
      extractedData: data,
    });

    const stored = create.mock.calls[0]![0].data;
    expect(typeof stored.extractedData).toBe("object"); // NOT a JSON string (B1)
    expect(stored.extractedData).toEqual(data);
    expect(stored.extractedText).toBe("plain"); // passthrough, no prefix

    expect(row.extractedData).toEqual(data); // read round-trips to the object
    expect(row.extractedText).toBe("plain");
  });

  it("WITH key: stores enc:v1: ciphertext and decrypts back to the original object + string", async () => {
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const data = { npi: "1234567890" };
    const row = await documentRepository.create(ctx, {
      ...doc,
      extractedText: "secret",
      extractedData: data,
    });

    const stored = create.mock.calls[0]![0].data;
    expect(typeof stored.extractedData).toBe("string");
    expect(stored.extractedData as string).toMatch(/^enc:v1:/);
    expect(stored.extractedText as string).toMatch(/^enc:v1:/);

    expect(row.extractedData).toEqual(data); // decrypted + parsed back to the object
    expect(row.extractedText).toBe("secret");
  });
});

describe("documentRepository.storageKeysByCandidate", () => {
  it("does NOT filter deletedAt — a purge must reach a soft-deleted document's file too", async () => {
    await documentRepository.storageKeysByCandidate(ctx, "c1");

    const [args] = findMany.mock.calls[0]!;
    expect(args.where).toEqual({ candidateId: "c1", storageKey: { not: null } });
    expect(args.where).not.toHaveProperty("deletedAt");
  });

  it("returns only the keys, dropping rows that never reached storage", async () => {
    findMany.mockResolvedValue([{ storageKey: "t1/c1/a.pdf" }, { storageKey: null }]);

    await expect(documentRepository.storageKeysByCandidate(ctx, "c1")).resolves.toEqual([
      "t1/c1/a.pdf",
    ]);
  });

  it("selects the key alone, so no encrypted field is read or decrypted", async () => {
    await documentRepository.storageKeysByCandidate(ctx, "c1");

    expect(findMany.mock.calls[0]![0].select).toEqual({ storageKey: true });
  });
});
