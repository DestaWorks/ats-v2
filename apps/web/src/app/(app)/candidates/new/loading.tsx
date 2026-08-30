import { Skeleton } from "@destaworks/ui/skeleton";

export default function AddCandidateLoading() {
  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white p-6">
        {Array.from({ length: 6 }, (_, field) => (
          <div key={field} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
