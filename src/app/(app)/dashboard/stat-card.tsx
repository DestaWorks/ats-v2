import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";

/** A single headline stat (label + big number), optionally tinted for emphasis. */
export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "red" | "orange";
}) {
  const valueClass = tone === "red" ? "text-red" : tone === "orange" ? "text-orange" : "text-navy";
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", valueClass)}>{value}</p>
    </Card>
  );
}
