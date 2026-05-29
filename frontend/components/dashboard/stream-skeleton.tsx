import { Card } from "@/components/ui/card";

export function StreamCardSkeleton() {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-2.5 w-20 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
        </div>
        <div className="skeleton h-6 w-16 rounded-full" />
      </div>
      <div className="mt-5 space-y-1.5">
        <div className="skeleton h-2.5 w-24 rounded" />
        <div className="skeleton h-7 w-40 rounded" />
        <div className="skeleton h-2.5 w-28 rounded" />
      </div>
      <div className="mt-5">
        <div className="skeleton h-1.5 w-full rounded-full" />
        <div className="mt-2 flex justify-between">
          <div className="skeleton h-2 w-8 rounded" />
          <div className="skeleton h-2 w-12 rounded" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div className="skeleton h-2 w-16 rounded" />
        <div className="skeleton h-7 w-14 rounded-xl" />
      </div>
    </Card>
  );
}
