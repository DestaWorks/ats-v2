"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CLIENT_DISCOVERY_SPECIALTY_GROUPS, US_STATES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * NPPES organization search form — mirrors `discover/discover-search-form.tsx` exactly: an
 * explicit **Search** button (not live/debounced filtering, since it fires a real external API
 * call), builds a `searchParams` string and `router.push`es inside a transition so the button
 * shows a pending state while the RSC re-reads.
 */
export function SearchForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    taxonomy: searchParams.get("taxonomy") ?? "",
    state: searchParams.get("state") ?? "",
    city: searchParams.get("city") ?? "",
    zip: searchParams.get("zip") ?? "",
  });

  const canSearch = Boolean(form.taxonomy || form.state || form.city || form.zip);

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
      method="post"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white shadow-card p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Specialty" htmlFor="cd-taxonomy">
          <Select
            id="cd-taxonomy"
            value={form.taxonomy}
            onChange={(e) => setForm({ ...form, taxonomy: e.target.value })}
          >
            <option value="">— Any —</option>
            {CLIENT_DISCOVERY_SPECIALTY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="State" htmlFor="cd-state">
          <Select
            id="cd-state"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          >
            <option value="">— Any —</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="cd-city">
          <Input
            id="cd-city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </Field>
        <Field label="Zip" htmlFor="cd-zip">
          <Input
            id="cd-zip"
            value={form.zip}
            onChange={(e) => setForm({ ...form, zip: e.target.value })}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={!canSearch} loading={pending}>
          Search
        </Button>
      </div>
    </form>
  );
}
