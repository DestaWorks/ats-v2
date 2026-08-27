/**
 * Format an ISO date string as a locale date, with an em-dash fallback for a missing or invalid
 * value. Shared by the candidate detail tabs (license expiry / verified-at, document created-at).
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}
