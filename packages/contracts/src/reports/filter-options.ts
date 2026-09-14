export interface ReportFilterOptionsDTO {
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  sources: readonly string[];
  credentials: readonly string[];
}

/**
 * Response body of `GET /reports/filter-options`. The endpoint takes no request parameters — the
 * vocabularies are whatever the caller's tenant holds, never a client-supplied selection.
 */
export type GetReportsFilterOptionsResponse = ReportFilterOptionsDTO;
