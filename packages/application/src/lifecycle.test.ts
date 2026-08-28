import { describe, expect, it, vi } from "vitest";

const closeDatabase = vi.fn(async () => {});
vi.mock("@destaworks/db/lifecycle", () => ({ closeDatabase }));

const { shutdownApplication } = await import("./lifecycle");

describe("shutdownApplication", () => {
  it("releases the database pool", async () => {
    await shutdownApplication();

    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  // The API's signal handler guards against a second SIGTERM, but an orchestrator that sends one
  // during a slow drain must not leave the process wedged behind a rejected close.
  it("stays safe to call twice", async () => {
    await shutdownApplication();
    await expect(shutdownApplication()).resolves.toBeUndefined();
  });
});
