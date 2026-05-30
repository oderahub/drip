"use client";

import { RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DecisionEventCard } from "@/components/decision-event-card";
import type { NormalizedFeedEvent } from "@/lib/event-mapping";

export function StreamFeed({
  events,
  isLoadingHistory,
  isWatching,
  backfillProgress,
  onRefresh,
}: {
  events: NormalizedFeedEvent[];
  isLoadingHistory: boolean;
  isWatching: boolean;
  backfillProgress: { done: number; total: number } | null;
  onRefresh: () => void;
}) {
  // Render newest-first for the feed display. The hook returns
  // canonical ascending order so reversing here is safe + idempotent.
  const display = [...events].reverse();
  const latestKey = display[0] ? `${display[0].blockHash}-${display[0].logIndex}` : null;

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Agent decisions</h2>
          {isWatching && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <Radio className="h-3 w-3" />
              live
            </span>
          )}
          {backfillProgress && backfillProgress.total > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span aria-hidden className="font-mono tabular-nums">
                {backfillProgress.done}/{backfillProgress.total}
              </span>
              scanning history
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {isLoadingHistory && display.length === 0 ? (
        <div className="space-y-3">
          <FeedSkeleton />
          <FeedSkeleton />
        </div>
      ) : display.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No agent activity yet. Once a policy is registered, scheduled checks fire on the
            configured interval and decisions land here in real time.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {display.map((r, i) => (
            <DecisionEventCard
              key={`${r.blockHash}-${r.logIndex}`}
              event={r.event}
              surface="light"
              isLatest={i === 0}
              index={Math.min(i, 4)} // limit stagger so old events don't take a noticeable delay
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div className="relative pl-8 sm:pl-10">
      <div aria-hidden className="absolute left-3 top-0 bottom-[-12px] w-px bg-border sm:left-4" />
      <div aria-hidden className="absolute left-[5px] top-6 h-2.5 w-2.5 rounded-full bg-muted ring-2 ring-background sm:left-[9px]" />
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-3 w-12 rounded" />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      </Card>
    </div>
  );
}
