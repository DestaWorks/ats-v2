import { requirePageUser } from "@/lib/page-user";
import { hasCapability } from "@destaworks/domain/constants";
import { storageEnabled } from "@destaworks/integrations/storage";
import { ErrorState } from "@destaworks/ui/error-state";
import { MigrationWizard } from "./migration-wizard";

/**
 * Bulk Import / Candidate ETL (Wave 1.3) — server component. Reads the session server-side (auth
 * is never trusted from the client) and gates on the `bulkImport` capability (leadership per
 * DECISIONS D3). The `/api/migration/{prepare,commit}` routes enforce the same capability, so this
 * gate is defence-in-depth + a friendly no-access screen rather than the wizard shell.
 */
export default async function MigrationPage() {
  const user = await requirePageUser();

  if (!hasCapability(user.role, "bulkImport")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Bulk import is limited to leadership roles. Ask an Owner, Director, Manager, or Admin to run the migration."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Bulk Import from Indrasur</h1>
        <p className="text-sm text-gray">
          CSV + resume ZIP → AI parse → Pipeline candidates. Upload the export, review the match
          preview, then commit — re-running is safe (matched by legacy id).
        </p>
      </header>
      <MigrationWizard storageEnabled={storageEnabled} />
    </div>
  );
}
