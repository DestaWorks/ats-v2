"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LICENSE_STATUSES } from "@/lib/constants";
import {
  verifyLicenseSchema,
  type CandidateProfileDTO,
  type VerifyLicenseInput,
} from "@/lib/validation/candidate";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { fieldError } from "./lib/form-error";
import { inputClass, selectClass } from "./lib/field-styles";
import { messageForFailure, postVerifyLicense } from "./lib/detail-fetch";

/** Status dot color: Active = green, negative statuses = red, "Not Verified" = orange. */
function statusDotClass(status: string): string {
  if (status === "Active") return "bg-green";
  if (status === "Not Verified") return "bg-orange";
  return "bg-red";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function LicenseTab({
  candidate,
  canEditCredential,
  onVerified,
  announce,
}: {
  candidate: CandidateProfileDTO;
  canEditCredential: boolean;
  onVerified: (input: VerifyLicenseInput) => void;
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const form = useZodForm(verifyLicenseSchema, {
    defaultValues: {
      licenseStatus: candidate.licenseStatus as VerifyLicenseInput["licenseStatus"],
      licenseExpiry: undefined,
      ...(canEditCredential ? { licenseNumber: candidate.licenseNumber ?? undefined } : {}),
    },
  });

  if (candidate.track === "Operations") {
    return (
      <Card className="border-green/30 bg-green/5 p-6">
        <p className="text-sm font-semibold text-green">✓ No license required</p>
        <p className="mt-1 text-sm text-charcoal">
          This is an Operations candidate — the pipeline gates only require contact information.
        </p>
      </Card>
    );
  }

  function onSubmit(values: VerifyLicenseInput) {
    startTransition(async () => {
      const result = await postVerifyLicense(candidate.id, values);
      if (result.ok) {
        onVerified(values);
        setOpen(false);
        toast.success("License verification saved");
        announce(`License marked ${values.licenseStatus}`);
        router.refresh();
      } else if (result.failure.issues.length) {
        for (const issue of result.failure.issues) {
          form.setError(issue.path as keyof VerifyLicenseInput, { message: issue.message });
        }
        toast.error("Please fix the highlighted fields");
      } else {
        toast.error(messageForFailure(result.failure));
        announce(`Verification failed: ${messageForFailure(result.failure)}`);
      }
    });
  }

  const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("h-3 w-3 rounded-full", statusDotClass(candidate.licenseStatus))}
          />
          <span className="text-base font-semibold text-charcoal">{candidate.licenseStatus}</span>
        </div>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-gray">License state</dt>
            <dd className="font-medium text-charcoal">{candidate.licenseState ?? "—"}</dd>
          </div>
          {canEditCredential ? (
            <div className="flex justify-between gap-4 text-sm">
              <dt className="text-gray">License number</dt>
              <dd className="font-medium text-charcoal">{candidate.licenseNumber ?? "—"}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-gray">Expiry</dt>
            <dd className="font-medium text-charcoal">{formatDate(candidate.licenseExpiry)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-gray">Verified</dt>
            <dd className="font-medium text-charcoal">{formatDate(candidate.licenseVerifiedAt)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray">
          License status drives the pipeline gates — Initial Screening needs a verified license and
          Submitted to Client needs an Active one.
        </p>
      </Card>

      {open ? (
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Status"
              htmlFor="lic-status"
              error={fieldError(form, "licenseStatus")}
              required
            >
              <select id="lic-status" className={selectClass} {...form.register("licenseStatus")}>
                {LICENSE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expiry" htmlFor="lic-expiry" error={fieldError(form, "licenseExpiry")}>
              <input
                id="lic-expiry"
                type="date"
                className={inputClass}
                {...form.register("licenseExpiry", { setValueAs: emptyToNull })}
              />
            </Field>
            {canEditCredential ? (
              <Field
                label="License number"
                htmlFor="lic-number"
                error={fieldError(form, "licenseNumber")}
              >
                <input
                  id="lic-number"
                  className={inputClass}
                  {...form.register("licenseNumber", { setValueAs: emptyToNull })}
                />
              </Field>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Save verification
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Verify license
          </Button>
        </div>
      )}
    </div>
  );
}
