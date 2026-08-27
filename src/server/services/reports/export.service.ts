import "server-only";
import { statusLabel, type CandidateStatus } from "@/lib/constants";
import { toCsv, type CsvColumn } from "@/lib/reports/csv";
import { getDaysInStage } from "@/lib/rules/stage-timing";
import type { ReportFilters } from "@/lib/validation/reports";
import type { CandidateRow } from "@/server/repositories/candidate.repository";
import { loadCohort, scoreFor, type ReportCohort } from "./cohort";

const COLUMNS: CsvColumn<{ row: CandidateRow; cohort: ReportCohort; now: Date }>[] = [
  { header: "Name", value: ({ row }) => row.name },
  { header: "Credential", value: ({ row }) => row.credential },
  { header: "License State", value: ({ row }) => row.licenseState },
  { header: "License Status", value: ({ row }) => row.licenseStatus },
  {
    header: "Client",
    value: ({ row, cohort }) => (row.clientId ? (cohort.clientNames.get(row.clientId) ?? "") : ""),
  },
  { header: "Source", value: ({ row }) => row.source },
  { header: "Status", value: ({ row }) => statusLabel(row.status as CandidateStatus) },
  {
    header: "Added By",
    value: ({ row, cohort }) =>
      row.createdById ? (cohort.userNames.get(row.createdById) ?? "") : "",
  },
  { header: "Added At", value: ({ row }) => row.createdAt.toISOString().slice(0, 10) },
  { header: "Updated At", value: ({ row }) => row.updatedAt.toISOString().slice(0, 10) },
  { header: "Days In Stage", value: ({ row, now }) => getDaysInStage(row.stageEnteredAt, now) },
  {
    header: "Score",
    value: ({ row, cohort, now }) => scoreFor(row, cohort.rulesByClient, now) ?? "",
  },
];

/**
 * CSV export (Wave 5.2) — legacy's export was 100% client-side (build a string from the already-
 * loaded browser data, no backend call at all); this is a real server route reusing the same
 * filtered cohort every report derives from, so the export always matches what's on screen.
 */
export const exportService = {
  async candidatesCsv(filters: ReportFilters): Promise<string> {
    const cohort = await loadCohort(filters);
    const now = new Date();
    return toCsv(
      cohort.candidates.map((row) => ({ row, cohort, now })),
      COLUMNS,
    );
  },
};
