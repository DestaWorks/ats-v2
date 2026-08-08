"use client";

import { useId, useState } from "react";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { accessRequestSchema, type AccessRequestInput } from "@/lib/validation/auth";
import { authInputClass, AuthLabel } from "../auth-field";
import { submitAccessRequest } from "./actions";

export function RequestAccessForm() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const orgId = useId();
  const messageId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(accessRequestSchema);

  async function onSubmit(values: AccessRequestInput) {
    setServerError(null);
    const res = await submitAccessRequest(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green/15 text-2xl text-green">
          ✓
        </span>
        <p className="mb-1.5 text-base font-semibold text-ivory">Request Submitted</p>
        <p className="text-[13px] text-ivory/40">
          You will receive an email when your access is approved.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3.5 text-[13px] leading-relaxed text-ivory/40">
        Access is restricted to authorized Desta Works team members. Submit a request and
        you&apos;ll be notified when approved.
      </p>

      <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="mb-3.5">
          <AuthLabel htmlFor={nameId}>Full name *</AuthLabel>
          <input
            id={nameId}
            placeholder="Your full name"
            {...register("name")}
            className={authInputClass}
          />
          {errors.name ? (
            <p className="mt-1 text-xs text-[#EF9A9A]">{errors.name.message}</p>
          ) : null}
        </div>

        <div className="mb-3.5">
          <AuthLabel htmlFor={emailId}>Email *</AuthLabel>
          <input
            id={emailId}
            type="email"
            placeholder="your@email.com"
            {...register("email")}
            className={authInputClass}
          />
          {errors.email ? (
            <p className="mt-1 text-xs text-[#EF9A9A]">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="mb-3.5">
          <AuthLabel htmlFor={orgId}>
            Organization <span className="text-ivory/25">(optional)</span>
          </AuthLabel>
          <input
            id={orgId}
            placeholder="Your organization"
            {...register("organization")}
            className={authInputClass}
          />
        </div>

        <div className="mb-4.5">
          <AuthLabel htmlFor={messageId}>
            Message <span className="text-ivory/25">(optional)</span>
          </AuthLabel>
          <textarea
            id={messageId}
            rows={3}
            placeholder="A message to the admin"
            {...register("message")}
            className={authInputClass + " resize-y"}
          />
        </div>

        {serverError ? (
          <div className="mb-3.5 rounded-lg border border-red/25 bg-red/[0.12] px-3 py-2.5 text-[13px] text-[#EF9A9A]">
            {serverError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-navy py-3.5 text-[15px] font-semibold text-ivory transition hover:opacity-90 disabled:opacity-40"
        >
          {isSubmitting ? "Sending…" : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
