export interface ReportFilterOptionsDTO {
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  sources: readonly string[];
  credentials: readonly string[];
}
