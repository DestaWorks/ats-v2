import { Skeleton } from "@destaworks/ui/skeleton";

export default function ClientDiscoveryLoading() {
  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, row) => (
          <Skeleton key={row} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
