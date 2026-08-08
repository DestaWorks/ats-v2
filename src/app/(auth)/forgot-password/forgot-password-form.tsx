"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { requestPasswordResetSchema, type RequestPasswordResetInput } from "@/lib/validation/auth";
import { authInputClass, AuthLabel } from "../auth-field";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const emailId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(requestPasswordResetSchema);

  async function onSubmit(values: RequestPasswordResetInput) {
    // Better Auth always reports success here regardless of whether the email exists (a
    // timing-attack mitigation against account enumeration) — the UI can't and shouldn't
    // distinguish the two cases either.
    await requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSent(true);
  }

  if (sent) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green/15 text-2xl text-green">
          ✓
        </span>
        <p className="mb-1.5 text-base font-semibold text-ivory">Check Your Email</p>
        <p className="mb-4 text-[13px] text-ivory/40">
          If an account exists for that address, a reset link is on its way.
        </p>
        <Link
          href="/sign-in"
          className="block w-full rounded-lg bg-brand py-3.5 text-center text-[15px] font-semibold text-ivory transition hover:opacity-90"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3.5 text-[13px] leading-relaxed text-ivory/40">
        Enter the email address on your account and we&apos;ll send you a link to reset your
        password.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="mb-4">
          <AuthLabel htmlFor={emailId}>Email</AuthLabel>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            {...register("email")}
            className={authInputClass}
          />
          {errors.email ? (
            <p className="mt-1 text-xs text-[#EF9A9A]">{errors.email.message}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand py-3.5 text-[15px] font-semibold text-ivory transition hover:opacity-90 disabled:opacity-40"
        >
          {isSubmitting ? "Sending…" : "Send Reset Link"}
        </button>

        <Link
          href="/sign-in"
          className="mt-3.5 block text-center text-xs text-ivory/40 hover:text-ivory/60"
        >
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
}
