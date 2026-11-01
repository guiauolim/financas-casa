import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
