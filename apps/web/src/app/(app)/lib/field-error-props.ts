import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { fieldError } from "../candidates/[id]/lib/form-error";

/**
 * Spreadable `<Field>` error prop: `{ error }` when the field has a message, `{}` when it
 * does not. Under `exactOptionalPropertyTypes` an explicit `error={undefined}` is a distinct
 * type from omitting the prop, so callers spread this instead of passing `fieldError(...)`.
 */
export function fieldErrorProps<T extends FieldValues>(
  form: UseFormReturn<T>,
  name: Path<T>,
): { error?: string } {
  const message = fieldError(form, name);
  return message === undefined ? {} : { error: message };
}
