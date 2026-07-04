"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(signInSchema);

  async function onSubmit(values: SignInInput) {
    const { error } = await signIn.email({ email: values.email, password: values.password });
    if (error) {
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    toast.success("Welcome back");
    router.push("/dashboard");
    router.refresh();
  }

  async function onGoogle() {
    await signIn.social({ provider: "google", callbackURL: "/dashboard" });
  }

  const inputClass =
    "rounded-md border border-black/15 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Sign in</h1>
        <p className="text-sm text-gray">DestaHealth ATS</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className={inputClass}
          />
        </Field>
        <Field label="Password" htmlFor="password" required error={errors.password?.message}>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-gray">
            <span className="h-px flex-1 bg-black/10" /> or{" "}
            <span className="h-px flex-1 bg-black/10" />
          </div>
          <Button type="button" variant="secondary" onClick={onGoogle}>
            Continue with Google
          </Button>
        </>
      ) : null}

      <p className="text-sm text-gray">
        No account?{" "}
        <Link href="/request-access" className="font-semibold text-navy hover:underline">
          Request access
        </Link>
      </p>
    </div>
  );
}
