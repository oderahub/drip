"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownToLine,
  CircleSlash,
  ShieldOff,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveBalance } from "@/components/live-balance";
import {
  type Stream,
  STATUS_BADGE,
  STATUS_LABEL,
  StreamStatus,
  availableBalance,
  progressFraction,
  streamedAmount,
} from "@/lib/stream";
import { useStreamActions } from "@/hooks/use-stream-actions";
import { ADDRESSES } from "@/lib/contracts";
import { cn, formatStt, shortAddress } from "@/lib/utils";

export function StreamHeader({ stream }: { stream: Stream }) {
  const { address, isConnected } = useAccount();
  const lower = address?.toLowerCase();
  const isSender = lower && stream.sender.toLowerCase() === lower;
  const isRecipient = lower && stream.recipient.toLowerCase() === lower;
  const role = isSender ? "sender" : isRecipient ? "recipient" : "observer";

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const max = stream.ratePerSecond * (stream.endTime - stream.startTime);
  const available = availableBalance(stream, nowSec);
  const streamed = streamedAmount(stream, nowSec);
  const progress = progressFraction(stream, nowSec);

  const actions = useStreamActions(stream.id);

  const barColor =
    stream.status === StreamStatus.Active
      ? "bg-primary"
      : stream.status === StreamStatus.Paused
        ? "bg-state-paused"
        : stream.status === StreamStatus.Completed
          ? "bg-state-completed"
          : "bg-state-cancelled";

  return (
    <div className="space-y-4">
      {/* Back link + page-level meta */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All streams
        </Link>
        <a
          href={`https://shannon-explorer.somnia.network/address/${ADDRESSES.testnet.drip}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Drip contract <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Main card */}
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          {/* Left — heading + ticker */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge
                variant={STATUS_BADGE[stream.status]}
                className={cn(
                  "gap-1.5 px-2.5 py-1 text-sm",
                  stream.status === StreamStatus.Paused && "ring-1 ring-state-paused/30",
                )}
              >
                {stream.status === StreamStatus.Cancelled && (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />
                )}
                {stream.status === StreamStatus.Active && (
                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                )}
                {STATUS_LABEL[stream.status]}
              </Badge>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Stream #{stream.id.toString()} · {role}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {stream.status === StreamStatus.Active && isRecipient ? "Available to withdraw" : "Streamed to recipient"}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                {stream.status === StreamStatus.Active && isRecipient ? (
                  <LiveBalance stream={stream} className="text-4xl font-semibold sm:text-5xl" />
                ) : stream.status === StreamStatus.Active ? (
                  <LiveBalance stream={stream} className="text-4xl font-semibold sm:text-5xl" />
                ) : (
                  <span className="font-numeric text-4xl font-semibold tabular-nums sm:text-5xl">
                    {formatStt(streamed, 4)}
                  </span>
                )}
                <span className="text-base font-medium text-muted-foreground">STT</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                of <span className="font-numeric tabular-nums">{formatStt(max, 4)}</span> STT total ·
                rate <span className="font-numeric tabular-nums">{formatStt(stream.ratePerSecond, 8)}</span>/s
              </p>
            </div>

            {/* Progress bar */}
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", barColor)}
                  style={{ width: `${Math.min(100, progress * 100).toFixed(2)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="tabular-nums">{(progress * 100).toFixed(1)}%</span>
                {stream.status === StreamStatus.Active && (
                  <span>started {timeAgoSec(stream.startTime)} ago · ends {timeUntilSec(stream.endTime)}</span>
                )}
                {stream.status === StreamStatus.Paused && (
                  <span className="text-state-paused">held since {timeAgoSec(stream.pausedAt)} ago</span>
                )}
              </div>
            </div>

            {/* Counterparty addresses */}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <PartyLine label="Sender" address={stream.sender} you={!!isSender} />
              <PartyLine label="Recipient" address={stream.recipient} you={!!isRecipient} />
            </div>
          </div>

          {/* Right — actions column */}
          <div className="space-y-3 lg:min-w-[230px]">
            {!isConnected && (
              <p className="rounded-2xl border border-border bg-muted/60 p-3 text-[11px] text-muted-foreground">
                Connect a wallet to act on this stream.
              </p>
            )}
            {isConnected && isRecipient && available > 0n && (stream.status === StreamStatus.Active || stream.status === StreamStatus.Paused) && (
              <Button
                className="w-full gap-2"
                onClick={actions.withdraw}
                disabled={actions.isPending || actions.confirming !== null}
              >
                {actions.confirming === "withdraw" || (actions.isPending && actions.confirming === null) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownToLine className="h-4 w-4" />
                )}
                Withdraw {formatStt(available, 4)} STT
              </Button>
            )}
            {isConnected && isSender && (stream.status === StreamStatus.Active || stream.status === StreamStatus.Paused) && (
              <>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={actions.disablePolicy}
                  disabled={actions.isPending || actions.confirming !== null}
                >
                  {actions.confirming === "disable" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldOff className="h-4 w-4" />
                  )}
                  Disable policy
                </Button>
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={actions.cancel}
                  disabled={actions.isPending || actions.confirming !== null}
                >
                  {actions.confirming === "cancel" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CircleSlash className="h-4 w-4" />
                  )}
                  Cancel stream
                </Button>
              </>
            )}
            {isConnected && (role === "observer" || (role === "recipient" && available === 0n)) && (
              <p className="rounded-2xl border border-border bg-muted/60 p-3 text-[11px] text-muted-foreground">
                {role === "observer"
                  ? "You're watching — only the sender or recipient can act on this stream."
                  : "Nothing available to withdraw right now."}
              </p>
            )}
            {(isSender || isRecipient) && (
              <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
                Pause and resume are <span className="font-medium">policies-only</span> — the agent
                decides those based on classifier verdicts. Sender can disable the policy to stop
                the chain.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function PartyLine({
  label,
  address,
  you,
}: {
  label: string;
  address: `0x${string}`;
  you: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {you && <span className="ml-1.5 text-primary">· you</span>}
      </p>
      <a
        href={`https://shannon-explorer.somnia.network/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-foreground/85 transition-colors hover:text-foreground"
      >
        {shortAddress(address, 10, 6)}
        <ExternalLink className="h-3 w-3 opacity-60" />
      </a>
    </div>
  );
}

function timeAgoSec(unixSec: bigint): string {
  const sec = Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSec));
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h`;
  return `${Math.floor(sec / 86400)} d`;
}
function timeUntilSec(unixSec: bigint): string {
  const sec = Number(unixSec) - Math.floor(Date.now() / 1000);
  if (sec <= 0) return "ended";
  if (sec < 60) return `in ${sec} s`;
  if (sec < 3600) return `in ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `in ${Math.floor(sec / 3600)} h`;
  return `in ${Math.floor(sec / 86400)} d`;
}
