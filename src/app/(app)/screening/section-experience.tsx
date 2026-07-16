import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "./section-credential";

/** Experience (20%) — years of experience vs. the credential's minimum. */
export function SectionExperience({
  yearsExp,
  onChange,
  score,
}: {
  yearsExp: string;
  onChange: (value: string) => void;
  score: number;
}) {
  return (
    <Card className="p-4">
      <SectionHeading label="Experience" score={score} weight={20} />
      <div className="mt-3">
        <label htmlFor="sc-years" className="mb-1 block text-xs font-semibold text-gray">
          Years of experience
        </label>
        <Input
          id="sc-years"
          type="number"
          min={0}
          max={60}
          value={yearsExp}
          onChange={(e) => onChange(e.target.value)}
          className="w-24"
        />
      </div>
    </Card>
  );
}
