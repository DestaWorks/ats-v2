import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";
import { addLeadSchema, leadListQuerySchema } from "@destaworks/contracts/validation/lead";
import type { FieldIssue } from "@destaworks/contracts/api";
import { ZodValidationPipe, type ContractOutput } from "./zod-validation.pipe";

/**
 * The exception filter's ZodError branch, reproduced here as the ASSERTION ONLY — the pipe never
 * formats an envelope (that is the filter's single job). This is what the filter will render from
 * what the pipe throws, so a change to either side fails a test rather than drifting silently.
 * Mirrors `packages/integrations/src/http/api-handler.ts`.
 */
function renderIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** The error `fn` threw, so a test can assert on its shape rather than only that it threw. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Narrows what `caught` returned, having first asserted it really is a `ZodError`. */
function asZodError(error: unknown): ZodError {
  expect(error).toBeInstanceOf(ZodError);
  if (!(error instanceof ZodError)) throw new Error("unreachable: asserted above");
  return error;
}

describe("ZodValidationPipe", () => {
  describe("a valid payload passes through typed", () => {
    it("returns the parsed value", () => {
      const pipe = new ZodValidationPipe(addLeadSchema);

      const parsed = pipe.transform({ name: "  Ada Lovelace  ", state: "CA" });

      expect(parsed).toEqual({ name: "Ada Lovelace", state: "CA" });
    });

    it("infers the contract's type — the handler annotation is not `unknown`", () => {
      const pipe = new ZodValidationPipe(addLeadSchema);

      // Compile-time proof: this assignment only typechecks if `transform` returns the schema's
      // output. If the pipe degraded to `unknown`, `tsc --noEmit` fails here, not at runtime.
      const body: ContractOutput<typeof addLeadSchema> = pipe.transform({ name: "Ada Lovelace" });
      const name: string = body.name;

      expect(name).toBe("Ada Lovelace");
    });

    it("is structurally a Nest PipeTransform", () => {
      /** The surface Nest calls: `transform(value, metadata)`. */
      type PipeTransformLike<In, Out> = { transform(value: In, metadata: unknown): Out };

      const nestCompatible: PipeTransformLike<
        unknown,
        ContractOutput<typeof addLeadSchema>
      > = new ZodValidationPipe(addLeadSchema);

      expect(nestCompatible.transform({ name: "Ada Lovelace" }, {})).toEqual({
        name: "Ada Lovelace",
      });
    });
  });

  describe("`.strict()` semantics survive the boundary", () => {
    it("REJECTS an unknown key rather than stripping it", () => {
      const pipe = new ZodValidationPipe(addLeadSchema);

      const error = caught(() => pipe.transform({ name: "Ada Lovelace", status: "Responded Hot" }));

      // The failure mode this guards: a pipe that stripped instead would return
      // `{ name: "Ada Lovelace" }` and the request would succeed having silently discarded a key
      // the caller believed was applied.
      expect(renderIssues(asZodError(error))).toEqual([
        { path: "", message: expect.stringContaining("Unrecognized key") },
      ]);
    });

    it("does not strip: a stripping schema is the schema's choice, not the pipe's", () => {
      // `leadListQuerySchema` is a plain `z.object` (strips) — the pipe hands the value over
      // untouched either way, so strictness stays a contract decision.
      const pipe = new ZodValidationPipe(leadListQuerySchema);

      expect(pipe.transform({ page: "2", utm_source: "email" })).toEqual({ page: 2 });
    });
  });

  describe("a bad field produces the dotted-path issue shape", () => {
    it("joins nested paths with dots", () => {
      const schema = z
        .object({
          contact: z.object({ email: z.string().email() }).strict(),
          tags: z.array(z.string().min(1)),
        })
        .strict();
      const pipe = new ZodValidationPipe(schema);

      const error = caught(() =>
        pipe.transform({ contact: { email: "not-an-email" }, tags: ["ok", ""] }),
      );

      expect(renderIssues(asZodError(error)).map((issue) => issue.path)).toEqual([
        "contact.email",
        "tags.1",
      ]);
    });

    it("throws the ZodError itself — the pipe renders no envelope", () => {
      const pipe = new ZodValidationPipe(addLeadSchema);

      const error = caught(() => pipe.transform({ name: "" }));

      expect(error).toBeInstanceOf(ZodError);
      // Nothing envelope-shaped: no `error`, no `code`, no `status`. The filter owns all three.
      expect(error).not.toHaveProperty("code");
      expect(error).not.toHaveProperty("status");
    });
  });

  describe("query and params", () => {
    it("applies the contract's own coercion to string-valued query input", () => {
      const pipe = new ZodValidationPipe(leadListQuerySchema);

      expect(pipe.transform({ status: "Sourced", page: "3" })).toEqual({
        status: "Sourced",
        page: 3,
      });
    });

    it("validates route params against a strict schema", () => {
      const paramsSchema = z.object({ id: z.string().min(1) }).strict();
      const pipe = new ZodValidationPipe(paramsSchema);

      expect(pipe.transform({ id: "lead_123" })).toEqual({ id: "lead_123" });
      expect(caught(() => pipe.transform({ id: "" }))).toBeInstanceOf(ZodError);
    });
  });
});
