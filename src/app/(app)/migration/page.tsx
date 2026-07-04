import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { hasCapability } from "@/lib/constants";
import { ErrorState } from "@/components/ui/error-state";
import { MigrationWizard } from "./migration-wizard";

/**
 * Bulk Import / Candidate ETL (Wave 1.3) — server component. Reads the session server-side (auth
 * is never trusted from the client) and gates on the `bulkImport` capability (leadership per
 * DECISIONS D3). The `/api/migration/{prepare,commit}` routes enforce the same capability, so this
 * gate is defence-in-depth + a friendly no-access screen rather than the wizard shell.
 */
export default async function MigrationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!hasCapability(user.role, "bulkImport")) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Bulk import is limited to leadership roles. Ask an Owner, Director, Manager, or Admin to run the migration."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:p-8">
      <header>
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          Wave 1.3 · Migration
        </p>
        <h1 className="text-2xl font-bold text-navy">Bulk Import</h1>
        <p className="text-sm text-gray">
          One-shot Sheet→Postgres import of the historical candidates. Upload the export, review the
          report, then commit — re-running is safe (matched by legacy id).
        </p>
      </header>
      <MigrationWizard />
    </main>
  );
}
