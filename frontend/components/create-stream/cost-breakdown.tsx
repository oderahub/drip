"use client";

import { Card } from "@/components/ui/card";
import { CostBreakdown, CYCLE_COST_STT } from "@/lib/create-stream-schema";
import { cn } from "@/lib/utils";

export function CostBreakdownPanel({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <Card className="bg-muted/30 p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Estimated cost
      </p>
      <dl className="mt-3 space-y-2.5 text-sm">
        <Row label="Stream amount (locked in createStream)" value={`${breakdown.streamAmountStt.toFixed(4)} STT`} />
        <Row
          label={
            breakdown.policyFundingStt > 0
              ? `Policy funding (covers ~${breakdown.cyclesFunded} cycle${breakdown.cyclesFunded === 1 ? "" : "s"})`
              : "Policy funding"
          }
          value={`${breakdown.policyFundingStt.toFixed(4)} STT`}
          muted={breakdown.policyFundingStt === 0}
        />
        {breakdown.cyclesEstimated > 0 && (
          <Row
            label={
              breakdown.cyclesEstimated > breakdown.cyclesFunded
                ? `Stream's full lifetime would need ~${breakdown.cyclesEstimated} cycles (${(breakdown.cyclesEstimated * CYCLE_COST_STT).toFixed(2)} STT) — top up later as it runs`
                : "Funded cycles cover the full stream lifetime"
            }
            muted
          />
        )}
        <div className="border-t border-border pt-2.5">
          <Row
            label="Total to send"
            value={`${breakdown.totalSendStt.toFixed(4)} STT`}
            strong
          />
        </div>
      </dl>
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value?: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", muted && "text-muted-foreground")}>
      <dt className={cn("flex-1", strong && "font-semibold text-foreground")}>{label}</dt>
      {value && (
        <dd
          className={cn(
            "font-numeric tabular-nums",
            strong ? "text-base font-semibold text-foreground" : "text-foreground/85"
          )}
        >
          {value}
        </dd>
      )}
    </div>
  );
}
