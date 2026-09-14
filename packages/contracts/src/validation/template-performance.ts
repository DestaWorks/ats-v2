/**
 * `GET /api/templates/performance` response (Wave 4.1, Templates — legacy `index.html:8784-8855`).
 * `rate`/`avgDays` are `null` when there's nothing to compute from (no lead sends → no response
 * data at all; see `template-performance.service.ts` for why response-rate is lead-only). Color-
 * tiering (green ≥20% / orange ≥10% / gray >0% / red 0%) is a presentation concern computed by the
 * UI off `rate`, not baked into the DTO.
 */
export interface TemplatePerformanceRowDTO {
  templateId: string;
  templateName: string;
  category: string;
  sends: number;
  candidateSends: number;
  leadSends: number;
  responses: number;
  rate: number | null;
  avgDays: number | null;
  topChannel: string | null;
}

export interface TemplatePerformanceDTO {
  rows: TemplatePerformanceRowDTO[];
}
