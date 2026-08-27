import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@destaworks/auth/guards";

/**
 * Proves `userPreferencesService` reads/writes exactly the SESSION user's own row — never an id
 * from the input — and that a missing user (edge case, e.g. deleted mid-session) maps to
 * NOT_FOUND on read.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  userRepo: { findPreferences: vi.fn(), updatePreferences: vi.fn() },
  uploadPublic: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@destaworks/integrations/storage", () => ({
  AVATAR_BUCKET: "avatars",
  uploadPublic: h.uploadPublic,
}));

import { userPreferencesService } from "./user-preferences.service";

beforeEach(() => {
  h.userRepo.findPreferences.mockReset();
  h.userRepo.updatePreferences.mockReset();
  h.uploadPublic.mockReset();
});

describe("userPreferencesService.getMine", () => {
  it("reads preferences for the SESSION user's id", async () => {
    h.userRepo.findPreferences.mockResolvedValue({
      emailSignature: "Best,\nJane",
      stickyNote: null,
    });
    const out = await userPreferencesService.getMine(h.user as AuthUser);
    expect(h.userRepo.findPreferences).toHaveBeenCalledWith("u1");
    expect(out).toEqual({ emailSignature: "Best,\nJane", stickyNote: null });
  });

  it("throws NOT_FOUND when the user row is gone", async () => {
    h.userRepo.findPreferences.mockResolvedValue(null);
    await expect(userPreferencesService.getMine(h.user as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("userPreferencesService.updateMine", () => {
  it("writes to the SESSION user's own id, forwarding only the given input", async () => {
    h.userRepo.updatePreferences.mockResolvedValue({
      emailSignature: null,
      stickyNote: "Call Jane back",
    });
    const out = await userPreferencesService.updateMine(h.user as AuthUser, {
      stickyNote: "Call Jane back",
    });
    expect(h.userRepo.updatePreferences).toHaveBeenCalledWith("u1", {
      stickyNote: "Call Jane back",
    });
    expect(out.stickyNote).toBe("Call Jane back");
  });
});

describe("userPreferencesService.uploadAvatar", () => {
  it("decodes the data URI and uploads to a per-user key in the avatars bucket", async () => {
    h.uploadPublic.mockResolvedValue("https://cdn.example.com/avatars/u1.jpg");
    const tinyJpegBase64 = Buffer.from("fake-jpeg-bytes").toString("base64");

    const out = await userPreferencesService.uploadAvatar(h.user as AuthUser, {
      dataUrl: `data:image/jpeg;base64,${tinyJpegBase64}`,
    });

    expect(out).toEqual({ url: "https://cdn.example.com/avatars/u1.jpg" });
    const [bucket, key, bytes, contentType] = h.uploadPublic.mock.calls[0]!;
    expect(bucket).toBe("avatars");
    expect(key).toBe("u1.jpg");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.toString()).toBe("fake-jpeg-bytes");
    expect(contentType).toBe("image/jpeg");
  });

  it("throws BAD_REQUEST for a non-data-URI string", async () => {
    await expect(
      userPreferencesService.uploadAvatar(h.user as AuthUser, { dataUrl: "not-a-data-url" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.uploadPublic).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for an SVG data URI (can embed a <script>)", async () => {
    const svgBase64 = Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64");
    await expect(
      userPreferencesService.uploadAvatar(h.user as AuthUser, {
        dataUrl: `data:image/svg+xml;base64,${svgBase64}`,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.uploadPublic).not.toHaveBeenCalled();
  });
});
