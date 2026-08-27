import type { output, ZodType } from "zod";

/**
 * The value a handler parameter receives once `S` has validated it.
 *
 * Controllers annotate with `ContractOutput<typeof someSchema>` rather than naming a type of
 * their own: the wire shape is whatever `@destaworks/contracts` says it is, in one place
 * (SAAS-RESTRUCTURE-PLAN, "Engineering standards → API contracts"). A controller that
 * re-declares the shape is the drift this alias exists to prevent.
 */
export type ContractOutput<S extends ZodType> = output<S>;

/**
 * Validates one handler argument — body, query or route params — against a schema supplied by
 * `@destaworks/contracts`. The single validation point for a request (Phase 4.2): a service is
 * handed parsed, typed input and never re-validates it.
 *
 * Structurally a NestJS `PipeTransform<unknown, Out>`; it deliberately imports nothing from
 * `@nestjs/common` so it carries no dependency the Phase 4.1 scaffold has not installed yet and
 * stays unit-testable without a Nest container. Adding `implements PipeTransform<unknown, Out>`
 * once the scaffold lands is a one-line change with no behavioural effect.
 *
 * Bound per handler with the schema as its argument, which is what keeps the shape in the
 * contracts package:
 *
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(addLeadSchema)) body: ContractOutput<typeof addLeadSchema>)
 * ```
 *
 * Failure semantics: `parse` throws the raw `ZodError` and the exception filter renders it —
 * 422, `code: "BAD_REQUEST"`, `issues: [{ path, message }]` with dotted paths. This class
 * formats nothing; a second renderer would drift from the first.
 *
 * Strictness is the schema's decision, not the pipe's. 84 contract schemas are `.strict()` so
 * that an unknown key is REJECTED rather than silently stripped; the pipe hands the value to
 * the schema untouched — no pre-stripping, no `passthrough`, no coercion of its own — so that
 * decision survives the boundary intact.
 */
export class ZodValidationPipe<Out, In = Out> {
  constructor(private readonly schema: ZodType<Out, In>) {}

  transform(value: unknown): Out {
    return this.schema.parse(value);
  }
}
