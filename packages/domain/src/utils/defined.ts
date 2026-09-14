/**
 * Drop the keys whose value is `undefined`, at runtime AND in the type.
 *
 * Under `exactOptionalPropertyTypes` a present-but-`undefined` key is a different thing from an
 * absent key, and the difference is load-bearing: Prisma reads an absent key as "leave this column
 * alone" but treats an explicit `undefined` differently, and `Object.keys` sees one but not the
 * other. A zod `.optional()` field infers as `k?: T | undefined`, so a parsed body/query can't be
 * handed straight to a service or Prisma input — this narrows it to the exact-optional shape they
 * want.
 */
export type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

export function defined<T extends object>(obj: T): Defined<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) out[key] = value;
  }
  // The loop is what makes this true; no signature can express "every undefined key is gone".
  return out as Defined<T>;
}
