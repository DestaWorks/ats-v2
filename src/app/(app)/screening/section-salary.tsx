import { SALARY_RANGES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "./section-credential";

/** Salary (10%) — the candidate's ask vs. the credential's typical range. */
export function SectionSalary({
  credential,
  salaryAsk,
  onChange,
  score,
}: {
  credential: string | null;
  salaryAsk: string;
  onChange: (value: string) => void;
  score: number;
}) {
  const range = credential ? SALARY_RANGES[credential] : undefined;
  return (
    <Card className="p-4">
      <SectionHeading label="Salary" score={score} weight={10} />
      <div className="mt-3">
        <label htmlFor="sc-salary" className="mb-1 block text-xs font-semibold text-gray">
          Salary ask{" "}
          {range ? (
            <span className="font-normal text-gray/70">
              (typical: ${range[0].toLocaleString()}–${range[1].toLocaleString()})
            </span>
          ) : null}
        </label>
        <Input
          id="sc-salary"
          type="number"
          min={0}
          value={salaryAsk}
          onChange={(e) => onChange(e.target.value)}
          className="w-32"
        />
      </div>
    </Card>
  );
}
