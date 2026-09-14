import { Skeleton } from "@destaworks/ui/skeleton";

export default function PortalLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-9 w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, row) => (
          <Skeleton key={row} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
