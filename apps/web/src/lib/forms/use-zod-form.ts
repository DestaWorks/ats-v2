import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z, ZodType } from "zod";

/**
 * The standard form stack: react-hook-form + a Zod schema (CONVENTIONS §5).
 * Pass the same Zod schema used at the API boundary so client and server validate
 * identically. Returns a fully-typed `UseFormReturn` inferred from the schema.
 *
 *   const form = useZodForm(signInSchema);
 *   <form onSubmit={form.handleSubmit(onSubmit)}> … </form>
 *
 * The resolver cast bridges a known variance mismatch between zod 4's schema
 * internals and @hookform/resolvers' generic — the schema's *output* is `z.infer<S>`,
 * which is exactly what react-hook-form consumes, so this is safe.
 */
export function useZodForm<S extends ZodType<FieldValues>>(
  schema: S,
  props?: Omit<UseFormProps<z.infer<S>>, "resolver">,
): UseFormReturn<z.infer<S>> {
  return useForm<z.infer<S>>({
    ...props,
    resolver: zodResolver(schema as never) as Resolver<z.infer<S>>,
  });
}
