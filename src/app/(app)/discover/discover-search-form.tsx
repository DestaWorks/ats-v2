"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TAXONOMY_OPTIONS, US_STATES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * NPPES search form (Wave 2.7) — hand-rolled (not `useZodForm`): `discoverSearchQuerySchema`'s
 * `.refine()` doesn't suit a resolver for partial client-side validation, and this needs an
 * explicit **Search** button rather than live/debounced filtering, since it fires a real external
 * API call. Builds a `searchParams` string and `router.push`es inside a transition so the button
 * shows a pending state while the RSC re-reads.
 */
export function DiscoverSearchForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    taxonomy: searchParams.get("taxonomy") ?? "",
    state: searchParams.get("state") ?? "",
    city: searchParams.get("city") ?? "",
    firstName: searchParams.get("firstName") ?? "",
    lastName: searchParams.get("lastName") ?? "",
  });

  const canSearch = Boolean(form.taxonomy || form.city || form.firstName || form.lastName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearch) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value) params.set(key, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Provider type" htmlFor="disc-taxonomy">
          <Select
            id="disc-taxonomy"
            value={form.taxonomy}
            onChange={(e) => setForm({ ...form, taxonomy: e.target.value })}
          >
            <option value="">Any</option>
            {TAXONOMY_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State" htmlFor="disc-state">
          <Select
            id="disc-state"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          >
            <option value="">Any</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="disc-city">
          <Input
            id="disc-city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </Field>
        <Field label="First name" htmlFor="disc-first">
          <Input
            id="disc-first"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </Field>
        <Field label="Last name" htmlFor="disc-last">
          <Input
            id="disc-last"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} disabled={!canSearch}>
          Search NPPES
        </Button>
        {!canSearch ? (
          <p className="text-xs text-gray">Add a provider type, city, or name to search.</p>
        ) : null}
      </div>
    </form>
  );
}
