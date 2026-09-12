/**
 * Categorical chart colours, as real hex.
 *
 * Recharts sets SVG `fill`/`stroke` attributes, so a Tailwind class name would render as nothing.
 * Deliberately NOT the pipeline-status palette, which is reserved for stage semantics — a colour
 * that means "Offer Accepted" somewhere must not mean "starter plan" here.
 */
export const CHART_SERIES: readonly string[] = [
  "#1e3a5f",
  "#2f7d8c",
  "#7b5ea7",
  "#c47f2e",
  "#5a8f4a",
  "#b5546a",
  "#8c8c8c",
];

const FALLBACK = "#1e3a5f";

export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length] ?? FALLBACK;
}
