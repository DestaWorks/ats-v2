import { SCHEDULE_OPTIONS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "./section-credential";

/** Schedule (15%) — the candidate's availability vs. the client's schedule. */
export function SectionSchedule({
  schedule,
  onChange,
  score,
}: {
  schedule: string;
  onChange: (value: string) => void;
  score: number;
}) {
  return (
    <Card className="p-4">
      <SectionHeading label="Schedule" score={score} weight={15} />
      <div className="mt-3">
        <label htmlFor="sc-schedule" className="mb-1 block text-xs font-semibold text-gray">
          Candidate&apos;s availability
        </label>
        <Select id="sc-schedule" value={schedule} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {SCHEDULE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      </div>
    </Card>
  );
}
