import { Card } from "@/components/ui/card";
import { PillToggle } from "@/components/ui/pill-toggle";
import { SectionHeading } from "./section-credential";

/** State (20%) — active licenses held vs. the client's required states. Defaults to 50% when the
 *  client has no state requirement (legacy: `neededStates.length>0 ? ... : 50`). */
export function SectionState({
  clientStates,
  held,
  onChange,
  score,
}: {
  clientStates: string[];
  held: string[];
  onChange: (next: string[]) => void;
  score: number;
}) {
  return (
    <Card className="p-4">
      <SectionHeading label="State License" score={score} weight={20} />
      {clientStates.length === 0 ? (
        <p className="mt-2 text-sm text-gray">
          This client has no state requirement (defaults to 50%).
        </p>
      ) : (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-gray">Licensed in</p>
          <PillToggle
            ariaLabel="States licensed in"
            options={clientStates.map((s) => ({ value: s, label: s }))}
            selected={held}
            onChange={onChange}
          />
        </div>
      )}
    </Card>
  );
}
