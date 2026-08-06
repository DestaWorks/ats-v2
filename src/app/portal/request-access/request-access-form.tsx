"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { portalAccessRequestSchema, type PortalAccessRequestInput } from "@/lib/validation/portal";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { submitPortalAccessRequest } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That portal link is invalid or has expired. Request a new one below.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
};

export function RequestAccessForm() {
  const [sent, setSent] = useState(false);
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(portalAccessRequestSchema);

  async function onSubmit(values: PortalAccessRequestInput) {
    const res = await submitPortalAccessRequest(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSent(true);
  }

  const inputClass = cn(controlClass, "px-3 py-2 text-sm");

  if (sent) {
    return (
      <EmptyState
        title="Request sent"
        description="Someone from DestaHealth will review your request and follow up with portal access."
      />
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Request portal access</h1>
        <p className="text-sm text-gray">
          For clients of DestaHealth who don&apos;t have a portal link yet.
        </p>
      </div>
      {linkError && ERROR_MESSAGES[linkError] ? (
        <p className="rounded-md bg-red/10 px-3 py-2 text-sm text-red">
          {ERROR_MESSAGES[linkError]}
        </p>
      ) : null}
      <form
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
        noValidate
      >
        <Field label="Name" htmlFor="name" required error={errors.name?.message}>
          <input id="name" {...register("name")} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <input id="email" type="email" {...register("email")} className={inputClass} />
        </Field>
        <Field
          label="Which client are you with?"
          htmlFor="requestedClientName"
          required
          error={errors.requestedClientName?.message}
        >
          <input
            id="requestedClientName"
            {...register("requestedClientName")}
            className={inputClass}
          />
        </Field>
        <Field label="Note" htmlFor="note" error={errors.note?.message}>
          <textarea id="note" rows={3} {...register("note")} className={inputClass} />
        </Field>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send request"}
        </Button>
      </form>
    </div>
  );
}
