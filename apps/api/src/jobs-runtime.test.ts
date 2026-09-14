import { describe, expect, it, beforeEach } from "vitest";
import {
  clearBriefGenerationEnqueuer,
  requireBriefGenerationEnqueuer,
} from "@destaworks/application/brief-generation.port";
import {
  clearMigrationCommitEnqueuer,
  requireMigrationCommitEnqueuer,
} from "@destaworks/application/migration-commit.port";
import { installJobRuntime } from "./jobs-runtime";

/**
 * The composition root is the one thing no other test covers: every suite that exercises an
 * enqueuing route registers its own fake port, so all of them pass whether or not the real process
 * ever registers anything. That is not a hypothetical gap — it shipped: `setJobQueue` was wired and
 * the ports were not, leaving the migration commit and both brief-generate routes answering
 * INTERNAL against a perfectly healthy queue.
 */
describe("installJobRuntime", () => {
  beforeEach(() => {
    clearMigrationCommitEnqueuer();
    clearBriefGenerationEnqueuer();
  });

  it("leaves the enqueue ports unusable until it runs", () => {
    expect(() => requireMigrationCommitEnqueuer()).toThrowError(/not available/i);
    expect(() => requireBriefGenerationEnqueuer()).toThrowError(/not available/i);
  });

  it("registers every enqueue port the routes resolve at request time", () => {
    installJobRuntime();

    expect(requireMigrationCommitEnqueuer()).toBeTypeOf("function");
    const briefs = requireBriefGenerationEnqueuer();
    expect(briefs.daily).toBeTypeOf("function");
    expect(briefs.weekly).toBeTypeOf("function");
  });

  it("constructs without connecting, so the API boots where no queue is provisioned", () => {
    expect(() => installJobRuntime().stop).toBeTypeOf("function");
  });
});
