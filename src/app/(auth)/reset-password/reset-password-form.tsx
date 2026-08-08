"use client";

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth-client";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { authInputClass, AuthLabel, BackToSignInLink, PasswordToggleButton } from "../auth-field";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalid = searchParams.get("error") === "INVALID_TOKEN" || !token;

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const newPasswordId = useId();
  const confirmId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(resetPasswordSchema);

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) return;
    setServerError(null);
    const { error } = await resetPassword({ newPassword: values.newPassword, token });
    if (error) {
      setServerError(error.message ?? "Could not reset your password");
      return;
    }
    setDone(true);
  }

  if (invalid) {
    return (
      <div className="py-2">
        <p className="mb-4 text-[13px] leading-relaxed text-ivory/40">
          This reset link is invalid or has expired. Request a new one from the sign-in screen.
        </p>
        <BackToSignInLink />
      </div>
    );
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green/15 text-2xl text-green">
          ✓
        </span>
        <p className="mb-1.5 text-base font-semibold text-ivory">Password Reset</p>
        <p className="mb-4 text-[13px] text-ivory/40">
          Your password has been changed. Sign in with your new password.
        </p>
        <button
          type="button"
          onClick={() => {
            router.push("/sign-in");
            router.refresh();
          }}
          className="w-full rounded-lg bg-brand py-3.5 text-[15px] font-semibold text-ivory transition hover:opacity-90"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3.5 text-[13px] leading-relaxed text-ivory/40">
        Choose a new password for your DestaHealth ATS account.
      </p>

      <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="mb-3.5">
          <AuthLabel htmlFor={newPasswordId}>New password</AuthLabel>
          <div className="relative">
            <input
              id={newPasswordId}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Enter a new password"
              {...register("newPassword")}
              className={authInputClass + " pr-14"}
            />
            <PasswordToggleButton
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
          {errors.newPassword ? (
            <p className="mt-1 text-xs text-[#EF9A9A]">{errors.newPassword.message}</p>
          ) : null}
        </div>

        <div className="mb-4">
          <AuthLabel htmlFor={confirmId}>Confirm new password</AuthLabel>
          <input
            id={confirmId}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            {...register("confirmPassword")}
            className={authInputClass}
          />
          {errors.confirmPassword ? (
            <p className="mt-1 text-xs text-[#EF9A9A]">{errors.confirmPassword.message}</p>
          ) : null}
        </div>

        {serverError ? (
          <div className="mb-3.5 rounded-lg border border-red/25 bg-red/[0.12] px-3 py-2.5 text-[13px] text-[#EF9A9A]">
            {serverError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand py-3.5 text-[15px] font-semibold text-ivory transition hover:opacity-90 disabled:opacity-40"
        >
          {isSubmitting ? "Resetting…" : "Reset Password"}
        </button>
      </form>
    </div>
  );
}
