import { useTransition } from "react";
import { toast } from "sonner";
import type { FieldValues, Path, UseFormProps } from "react-hook-form";
import type { z, ZodType } from "zod";
import { useZodForm } from "./use-zod-form";
import { messageForFailure, type ApiFailure, type ApiResult } from "@/lib/api/client";

/**
 * The `useZodForm` + `useTransition` + submit boilerplate repeated across every mutating form in
 * the app (CRM, Admin, candidates, roles, leads, ...): validate → call the API → map field-level
 * `ApiFailure.issues` onto `form.setError` → toast. That mapping is always identical; only what
 * happens on success/failure (navigation, local state updates, an `announce()` call) differs per
 * form, so those are supplied by the caller instead of hardcoded here.
 *
 *   const { form, pending, onSubmit } = useApiForm(createClientSchema, {
 *     defaultValues: { name: "" },
 *     submit: (values) => postJson<{ client: ClientProfileDTO }>("/api/crm/clients", values),
 *     onSuccess: (data) => { toast.success("Client added"); router.push(`/crm/${data.client.id}`); },
 *   });
 *   <form onSubmit={onSubmit} noValidate> ... </form>
 */
export function useApiForm<S extends ZodType<FieldValues>, T>(
  schema: S,
  options: {
    defaultValues?: UseFormProps<z.infer<S>>["defaultValues"];
    submit: (values: z.infer<S>) => Promise<ApiResult<T>>;
    onSuccess: (data: T, values: z.infer<S>) => void;
    /** Runs for any non-field-validation failure, AFTER the generic toast fires. Optional. */
    onFailure?: (message: string, failure: ApiFailure) => void;
  },
) {
  const form = useZodForm(
    schema,
    options.defaultValues ? { defaultValues: options.defaultValues } : undefined,
  );
  const [pending, startTransition] = useTransition();

  function submit(values: z.infer<S>) {
    startTransition(async () => {
      const result = await options.submit(values);
      if (result.ok) {
        options.onSuccess(result.data, values);
      } else if (result.failure.issues.length) {
        for (const issue of result.failure.issues) {
          form.setError(issue.path as unknown as Path<z.infer<S>>, { message: issue.message });
        }
        toast.error("Please fix the highlighted fields");
      } else {
        const message = messageForFailure(result.failure);
        toast.error(message);
        options.onFailure?.(message, result.failure);
      }
    });
  }

  return { form, pending, onSubmit: form.handleSubmit(submit) };
}
