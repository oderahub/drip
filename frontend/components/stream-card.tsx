"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveBalance } from "@/components/live-balance";
import {
  type Stream,
  STATUS_BADGE,
  STATUS_LABEL,
  StreamStatus,
  progressFraction,
  availableBalance,
  streamedAmount,
} from "@/lib/stream";
import { ADDRESSES } from "@/lib/contracts";
import { cn, formatStt, shortAddress } from "@/lib/utils";

interface StreamCardProps {
  stream: Stream;
}

export function StreamCard({ stream }: StreamCardProps) {
  const { address } = useAccount();
  const lower = address?.toLowerCase();
  const isSender = lower && stream.sender.toLowerCase() === lower;
  const isRecipient = lower && stream.recipient.toLowerCase() === lower;
  const role = isSender ? "sending" : isRecipient ? "receiving" : "watching";

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const max = stream.ratePerSecond * (stream.endTime - stream.startTime);
  const streamed = streamedAmount(stream, nowSec);
  const available = availableBalance(stream, nowSec);
  const progress = progressFraction(stream, nowSec);

  // Pick the bar colour from the locked palette.
  const barColour =
    stream.status === StreamStatus.Active
      ? "bg-primary"
      : stream.status === StreamStatus.Paused
        ? "bg-state-paused"
        : stream.status === StreamStatus.Completed
          ? "bg-state-completed"
          : "bg-state-cancelled";

  return (
    <Card className="group relative flex flex-col gap-5 p-5 transition-all hover:border-primary/30 sm:p-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Stream #{stream.id.toString()} · {role}
          </p>
          <p className="mt-1 text-sm leading-tight">
            <span className="font-mono text-xs text-muted-foreground">
              {isSender ? "to " : "from "}
            </span>
            <span className="font-mono text-sm font-medium">
              {shortAddress(isSender ? stream.recipient : stream.sender)}
            </span>
          </p>
        </div>
        <Badge
          variant={STATUS_BADGE[stream.status]}
          className="gap-1.5 px-2.5 py-1"
        >
          {stream.status === StreamStatus.Cancelled && (
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
          )}
          {STATUS_LABEL[stream.status]}
        </Badge>
      </div>

      {/* Ticker */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {stream.status === StreamStatus.Active && isRecipient ? "Available to withdraw" : "Streamed so far"}
        </p>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          {stream.status === StreamStatus.Active && isRecipient ? (
            <LiveBalance stream={stream} className="text-2xl font-semibold sm:text-3xl" />
          ) : (
            <span className="font-numeric text-2xl font-semibold tabular-nums sm:text-3xl">
              {formatStt(streamed, 4)}
            </span>
          )}
          <span className="text-sm font-medium text-muted-foreground">STT</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          of <span className="font-numeric">{formatStt(max, 4)}</span> STT total
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-700", barColour)}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100)).toFixed(2)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">{(progress * 100).toFixed(1)}%</span>
          {stream.status === StreamStatus.Active && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              flowing
            </span>
          )}
          {stream.status === StreamStatus.Paused && (
            <span className="text-state-paused">held by agent</span>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <a
          href={`https://shannon-explorer.somnia.network/address/${ADDRESSES.testnet.drip}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          on-chain
          <ExternalLink className="h-3 w-3" />
        </a>
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link href={`/streams/${stream.id}`}>
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
