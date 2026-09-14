import { Skeleton } from "@destaworks/ui/skeleton";

export default function CandidateDetailLoading() {
  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-72" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, chip) => (
          <Skeleton key={chip} className="h-6 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
