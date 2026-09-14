/**
 * The id + display-name pairs a filter dropdown needs, and nothing else.
 *
 * Separate from the full `ClientListDTO` / roster shapes on purpose. Those are gated — `viewCrm`
 * for CRM clients, `manageUsers` for the admin roster — because they carry commercial and account
 * detail. A filter's "which client?" select needs neither, so it gets its own minimal shape that
 * any signed-in member may read, rather than widening a gate to serve a dropdown.
 */
export interface LookupOptionDTO {
  id: string;
  name: string;
}

export interface LookupOptionsDTO {
  clients: LookupOptionDTO[];
  users: LookupOptionDTO[];
}
