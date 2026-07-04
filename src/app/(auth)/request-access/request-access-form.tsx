"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { accessRequestSchema, type AccessRequestInput } from "@/lib/validation/auth";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { submitAccessRequest } from "./actions";

export function RequestAccessForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(accessRequestSchema);

  async function onSubmit(values: AccessRequestInput) {
    const res = await submitAccessRequest(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSent(true);
  }

  const inputClass =
    "rounded-md border border-black/15 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none";

  if (sent) {
    return (
      <EmptyState
        title="Request sent"
        description="An administrator will review your request and set up your account."
        action={
          <Link href="/sign-in" className="text-sm font-semibold text-navy hover:underline">
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Request access</h1>
        <p className="text-sm text-gray">Accounts are approved by an administrator.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        <Field label="Name" htmlFor="name" required error={errors.name?.message}>
          <input id="name" {...register("name")} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <input id="email" type="email" {...register("email")} className={inputClass} />
        </Field>
        <Field label="Organization" htmlFor="organization" error={errors.organization?.message}>
          <input id="organization" {...register("organization")} className={inputClass} />
        </Field>
        <Field label="Message" htmlFor="message" error={errors.message?.message}>
          <textarea id="message" rows={3} {...register("message")} className={inputClass} />
        </Field>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send request"}
        </Button>
      </form>
      <p className="text-sm text-gray">
        Have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-navy hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
