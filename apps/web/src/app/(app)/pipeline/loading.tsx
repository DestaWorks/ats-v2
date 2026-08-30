import { Skeleton } from "@destaworks/ui/skeleton";

export default function PipelineLoading() {
  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Skeleton className="h-8 w-40" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }, (_, column) => (
          <div key={column} className="flex w-64 shrink-0 flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            {Array.from({ length: 4 }, (_, card) => (
              <Skeleton key={card} className="h-24 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
