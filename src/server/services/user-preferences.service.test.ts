import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `userPreferencesService` reads/writes exactly the SESSION user's own row — never an id
 * from the input — and that a missing user (edge case, e.g. deleted mid-session) maps to
 * NOT_FOUND on read.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  userRepo: { findPreferences: vi.fn(), updatePreferences: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));

import { userPreferencesService } from "./user-preferences.service";

beforeEach(() => {
  h.userRepo.findPreferences.mockReset();
  h.userRepo.updatePreferences.mockReset();
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
