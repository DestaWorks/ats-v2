import { COMM_ITEMS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "./section-credential";

/** Communication (10%) — a fixed 7-item checklist. */
export function SectionCommunication({
  checklist,
  onChange,
  score,
}: {
  checklist: string[];
  onChange: (next: string[]) => void;
  score: number;
}) {
  function toggle(id: string) {
    onChange(checklist.includes(id) ? checklist.filter((c) => c !== id) : [...checklist, id]);
  }

  return (
    <Card className="p-4 sm:col-span-2">
      <SectionHeading label="Communication & Responsiveness" score={score} weight={10} />
      <div className="mt-2 flex flex-col">
        {COMM_ITEMS.map((item) => {
          const checked = checklist.includes(item.id);
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 border-b border-black/5 py-1.5 text-sm last:border-0"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item.id)}
                className="h-4 w-4 rounded border-black/20"
              />
              <span className={checked ? "text-charcoal" : "text-gray"}>{item.label}</span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}
