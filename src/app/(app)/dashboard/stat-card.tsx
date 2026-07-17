import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";

export type StatCardTone = "default" | "red" | "orange" | "green" | "teal";

const TONE_CLASS: Record<StatCardTone, string> = {
  default: "text-navy",
  red: "text-red",
  orange: "text-orange",
  green: "text-green",
  teal: "text-teal",
};

/** A single headline stat (label + big number), optionally tinted for emphasis. */
export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: StatCardTone;
}) {
  const valueClass = TONE_CLASS[tone];
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", valueClass)}>{value}</p>
    </Card>
  );
}
