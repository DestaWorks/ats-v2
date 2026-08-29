import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: h.send })),
  PutObjectCommand: vi.fn((input) => ({ __type: "PutObjectCommand", ...input })),
  GetObjectCommand: vi.fn((input) => ({ __type: "GetObjectCommand", ...input })),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: h.getSignedUrl,
}));

const ENV_KEYS = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_URL_BASE",
] as const;

describe("storage integration", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    h.send.mockReset();
    h.getSignedUrl.mockReset();
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  function configure() {
    process.env.S3_ENDPOINT = "https://proj.supabase.co/storage/v1/s3";
    process.env.S3_ACCESS_KEY_ID = "key-id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_PUBLIC_URL_BASE = "https://proj.supabase.co/storage/v1/object/public";
  }

  it("storageEnabled is false and every function throws FEATURE_DISABLED when the env vars are unset", async () => {
    const storage = await import("./storage");
    expect(storage.storageEnabled).toBe(false);
    await expect(
      storage.uploadPublic(
        "avatars",
        storage.userStorageKey("u1", "avatar.jpg"),
        Buffer.from("x"),
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(
      storage.createSignedUploadUrl(
        "resumes",
        storage.tenantStorageKey("t1", "r1.pdf"),
        "application/pdf",
      ),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(
      storage.getSignedDownloadUrl("resumes", storage.persistedStorageKey("r1.pdf"), 300),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("uploadPublic uploads then returns a public URL built from S3_PUBLIC_URL_BASE", async () => {
    configure();
    h.send.mockResolvedValue({});
    const storage = await import("./storage");
    const url = await storage.uploadPublic(
      "avatars",
      storage.userStorageKey("u1", "avatar.jpg"),
      Buffer.from("x"),
      "image/jpeg",
    );
    expect(url).toBe("https://proj.supabase.co/storage/v1/object/public/avatars/u/u1/avatar.jpg");
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        __type: "PutObjectCommand",
        Bucket: "avatars",
        Key: "u/u1/avatar.jpg",
      }),
    );
  });

  it("uploadPublic throws UPSTREAM_ERROR when the upload fails", async () => {
    configure();
    h.send.mockRejectedValue(new Error("boom"));
    const storage = await import("./storage");
    await expect(
      storage.uploadPublic(
        "avatars",
        storage.userStorageKey("u1", "avatar.jpg"),
        Buffer.from("x"),
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("uploadPublic throws UPSTREAM_ERROR when S3_PUBLIC_URL_BASE is unset", async () => {
    configure();
    delete process.env.S3_PUBLIC_URL_BASE;
    h.send.mockResolvedValue({});
    const storage = await import("./storage");
    await expect(
      storage.uploadPublic(
        "avatars",
        storage.userStorageKey("u1", "avatar.jpg"),
        Buffer.from("x"),
        "image/jpeg",
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("createSignedUploadUrl returns a presigned PUT URL when configured", async () => {
    configure();
    h.getSignedUrl.mockResolvedValue(
      "https://proj.supabase.co/s3/resumes/r1.pdf?X-Amz-Signature=1",
    );
    const storage = await import("./storage");
    const result = await storage.createSignedUploadUrl(
      "resumes",
      storage.tenantStorageKey("t1", "r1.pdf"),
      "application/pdf",
    );
    expect(result).toEqual({
      signedUrl: "https://proj.supabase.co/s3/resumes/r1.pdf?X-Amz-Signature=1",
    });
    const [, command, opts] = h.getSignedUrl.mock.calls[0]!;
    expect(command).toMatchObject({
      __type: "PutObjectCommand",
      Bucket: "resumes",
      Key: "t/t1/r1.pdf",
      ContentType: "application/pdf",
    });
    expect(opts).toMatchObject({ expiresIn: 300 });
  });

  it("getSignedDownloadUrl returns a presigned GET URL when configured", async () => {
    configure();
    h.getSignedUrl.mockResolvedValue(
      "https://proj.supabase.co/s3/resumes/r1.pdf?X-Amz-Signature=2",
    );
    const storage = await import("./storage");
    const url = await storage.getSignedDownloadUrl(
      "resumes",
      storage.persistedStorageKey("r1.pdf"),
      300,
    );
    expect(url).toBe("https://proj.supabase.co/s3/resumes/r1.pdf?X-Amz-Signature=2");
    const [, command, opts] = h.getSignedUrl.mock.calls[0]!;
    expect(command).toMatchObject({ __type: "GetObjectCommand", Bucket: "resumes", Key: "r1.pdf" });
    expect(opts).toMatchObject({ expiresIn: 300 });
  });

  // 6.6 — key scoping. These need no S3 credentials: the constructors are pure.
  describe("key scoping", () => {
    it("puts the owner in the key, in a namespace per owner kind", async () => {
      const storage = await import("./storage");
      expect(storage.tenantStorageKey("tenant1", "abc.pdf")).toBe("t/tenant1/abc.pdf");
      expect(storage.userStorageKey("user1", "avatar.jpg")).toBe("u/user1/avatar.jpg");
    });

    it("keeps tenant and user namespaces disjoint for the same id", async () => {
      const storage = await import("./storage");
      // The point of the discriminator: `cuid()`s for a tenant and a user are drawn from the same
      // alphabet, so without it one could address the other's objects.
      expect(storage.tenantStorageKey("same", "f.pdf")).not.toBe(
        storage.userStorageKey("same", "f.pdf"),
      );
    });

    it("joins several segments under the owner", async () => {
      const storage = await import("./storage");
      expect(storage.tenantStorageKey("t1", "candidates", "exp1.csv")).toBe(
        "t/t1/candidates/exp1.csv",
      );
    });

    it("refuses a segment that would escape or collapse the prefix", async () => {
      const storage = await import("./storage");
      for (const bad of ["", "..", ".", "a/b", "a\\b", "a\0b"]) {
        expect(() => storage.tenantStorageKey("t1", bad)).toThrowError(
          expect.objectContaining({ code: "BAD_REQUEST" }),
        );
      }
      expect(() => storage.tenantStorageKey("../other", "f.pdf")).toThrowError(
        expect.objectContaining({ code: "BAD_REQUEST" }),
      );
      expect(() => storage.tenantStorageKey("t1")).toThrowError(
        expect.objectContaining({ code: "BAD_REQUEST" }),
      );
    });

    it("takes an already-persisted key verbatim, so objects written before scoping still resolve", async () => {
      const storage = await import("./storage");
      expect(storage.persistedStorageKey("legacy-uuid-resume.pdf")).toBe("legacy-uuid-resume.pdf");
    });
  });

  it("getSignedDownloadUrl throws UPSTREAM_ERROR on failure", async () => {
    configure();
    h.getSignedUrl.mockRejectedValue(new Error("boom"));
    const storage = await import("./storage");
    await expect(
      storage.getSignedDownloadUrl("resumes", storage.persistedStorageKey("r1.pdf"), 300),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});
