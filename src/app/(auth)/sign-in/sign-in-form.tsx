"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, requestPasswordReset } from "@/lib/auth-client";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { authInputClass, AuthLabel } from "../auth-field";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useZodForm(signInSchema);

  async function onSubmit(values: SignInInput) {
    setServerError(null);
    const { error } = await signIn.email({ ...values, rememberMe });
    if (error) {
      setServerError(error.message ?? "Sign in failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function onGoogle() {
    await signIn.social({ provider: "google", callbackURL: "/dashboard" });
  }

  async function onForgotPassword() {
    if (resetSent || resetSending) return;
    const email = getValues("email");
    if (!email || !email.includes("@")) {
      setServerError("Enter your email above first, then click “Forgot password?”");
      return;
    }
    setServerError(null);
    setResetSending(true);
    // Better Auth always reports success here regardless of whether the email exists (a
    // timing-attack mitigation against account enumeration) — the UI can't and shouldn't
    // distinguish the two cases either.
    await requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSending(false);
    setResetSent(true);
  }

  return (
    <div>
      {googleEnabled ? (
        <>
          <button
            type="button"
            onClick={() => void onGoogle()}
            className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-3 text-sm font-medium text-ivory transition hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Sign in with Google
          </button>

          <div className="mb-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] tracking-wide text-ivory/30">OR</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="mb-3.5">
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

        <div className="mb-2">
          <AuthLabel htmlFor={passwordId}>Password</AuthLabel>
          <div className="relative">
            <input
              id={passwordId}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              {...register("password")}
              className={authInputClass + " pr-14"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-ivory/40 hover:text-ivory/70"
            >
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>
          {errors.password ? (
            <p className="mt-1 text-xs text-[#EF9A9A]">{errors.password.message}</p>
          ) : null}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={
                "flex h-4 w-4 items-center justify-center rounded border-[1.5px] text-[10px] text-ivory " +
                (rememberMe ? "border-brand bg-brand" : "border-white/20")
              }
            >
              {rememberMe ? "✓" : ""}
            </span>
            <span className="text-xs text-ivory/40">Remember me</span>
          </label>
          <button
            type="button"
            onClick={() => void onForgotPassword()}
            disabled={resetSending}
            className="text-xs text-brand hover:underline disabled:no-underline disabled:opacity-60"
          >
            {resetSent ? "Check your email ✓" : resetSending ? "Sending…" : "Forgot password?"}
          </button>
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
          {isSubmitting ? "Signing in…" : "Sign In"}
        </button>

        <p className="mt-3 text-center text-[10px] text-ivory/20">
          🔒 Encrypted connection · Secure session cookie
        </p>
      </form>
    </div>
  );
}
