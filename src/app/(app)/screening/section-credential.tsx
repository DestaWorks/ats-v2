import { CRED_REQS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { PillToggle } from "@/components/ui/pill-toggle";

/** Credential (25%) — required + preferred qualifications held, checked against the candidate's
 *  credential type (legacy `CRED_REQS`, `legacy/index.html:6696-6706`). */
export function SectionCredential({
  credential,
  held,
  onChange,
  score,
}: {
  credential: string | null;
  held: string[];
  onChange: (next: string[]) => void;
  score: number;
}) {
  const req = credential ? CRED_REQS[credential] : undefined;

  if (!req) {
    return (
      <Card className="p-4">
        <SectionHeading label="Credential" score={score} weight={25} />
        <p className="mt-2 text-sm text-gray">
          No requirements mapped for {credential ?? "this candidate's credential"}.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <SectionHeading label="Credential" score={score} weight={25} />
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray">Required</p>
          <PillToggle
            ariaLabel="Required qualifications held"
            options={req.required.map((r) => ({ value: r, label: r }))}
            selected={held}
            onChange={onChange}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray">Preferred</p>
          <PillToggle
            ariaLabel="Preferred qualifications held"
            options={req.preferred.map((r) => ({ value: r, label: r }))}
            selected={held}
            onChange={onChange}
          />
        </div>
      </div>
    </Card>
  );
}

/** Shared "Label ... NN% · Weight: N%" heading for every section card. */
export function SectionHeading({
  label,
  score,
  weight,
}: {
  label: string;
  score: number;
  weight: number;
}) {
  const tone = score >= 80 ? "text-green" : score >= 50 ? "text-orange" : "text-red";
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-bold text-charcoal">{label}</h3>
      <div className="text-right">
        <p className={`text-lg font-bold ${tone}`}>{score}%</p>
        <p className="text-[10px] text-gray">Weight: {weight}%</p>
      </div>
    </div>
  );
}
