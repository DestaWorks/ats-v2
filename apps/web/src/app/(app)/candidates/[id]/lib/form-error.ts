import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/** Resolve a react-hook-form error message by (possibly dotted) field path. */
export function fieldError<T extends FieldValues>(
  form: UseFormReturn<T>,
  name: Path<T>,
): string | undefined {
  let cursor: unknown = form.formState.errors;
  for (const part of (name as string).split(".")) {
    if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  const message = (cursor as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : undefined;
}
