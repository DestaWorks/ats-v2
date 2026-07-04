"use client";

import { useRef } from "react";
import {
  RESUME_VARIANTS,
  RESUME_VARIANT_LABELS,
  type ResumeVariant,
} from "@/lib/constants/documents";
import { cn } from "@/lib/utils/cn";

/** Copy/icons mirror the legacy `ROLES` cards (index.html ~3170). */
const VARIANT_META: Record<ResumeVariant, { icon: string; sub: string; examples: string }> = {
  clinical: {
    icon: "🧠",
    sub: "Therapists, counselors, psychologists",
    examples: "LPC · LCSW · LMFT · LMHC · PsyD · PhD · BCBA",
  },
  prescriber: {
    icon: "💊",
    sub: "Psychiatrists and prescribing mid-levels",
    examples: "MD · DO · PMHNP-BC · APRN · PA-C",
  },
  operations: {
    icon: "🗂️",
    sub: "Admin, billing, intake, scheduling",
    examples: "Patient intake · Billing · Credentialing support",
  },
};

/**
 * Accessible variant (role) picker — an ARIA radio group with roving tabindex + arrow-key
 * navigation and visible focus. Selecting a card sets the résumé parse schema + render layout.
 */
export function VariantPicker({
  value,
  onChange,
}: {
  value: ResumeVariant | null;
  onChange: (variant: ResumeVariant) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = RESUME_VARIANTS.length - 1;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = index === 0 ? last : index - 1;
    else return;
    event.preventDefault();
    const variant = RESUME_VARIANTS[next];
    if (!variant) return;
    onChange(variant);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-charcoal">Step 1 — What&apos;s the role?</p>
      <div role="radiogroup" aria-label="Résumé role" className="grid gap-4 sm:grid-cols-3">
        {RESUME_VARIANTS.map((variant, index) => {
          const meta = VARIANT_META[variant];
          const selected = value === variant;
          return (
            <button
              key={variant}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!value && index === 0) ? 0 : -1}
              onClick={() => onChange(variant)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-5 text-center transition",
                "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
                selected
                  ? "border-navy shadow-[0_4px_14px_rgba(0,0,0,0.06)]"
                  : "border-black/10 hover:-translate-y-0.5 hover:border-navy/60",
              )}
            >
              <span className="text-3xl" aria-hidden>
                {meta.icon}
              </span>
              <span className="text-base font-bold text-navy">
                {RESUME_VARIANT_LABELS[variant]}
              </span>
              <span className="text-xs text-gray">{meta.sub}</span>
              <span className="text-[11px] leading-relaxed text-gray/80">{meta.examples}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
