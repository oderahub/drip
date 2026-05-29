"use client";

import { Activity, Droplets, PauseCircle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useReadContract, useChainId } from "wagmi";
import { dripAbi } from "@/lib/abi/drip";
import { ADDRESSES } from "@/lib/contracts";
import { type Stream, StreamStatus } from "@/lib/stream";
import { cn, formatStt } from "@/lib/utils";

export function StatCards({ streams }: { streams: Stream[] }) {
  const chainId = useChainId();
  const addr =
    chainId === 5031 ? ADDRESSES.mainnet.drip : ADDRESSES.testnet.drip;

  const treasuryHealth = useReadContract({
    address: addr,
    abi: dripAbi,
    functionName: "treasuryHealth",
    query: { refetchInterval: 12_000 },
  });

  const active = streams.filter((s) => s.status === StreamStatus.Active).length;
  const paused = streams.filter((s) => s.status === StreamStatus.Paused).length;

  const committed = treasuryHealth.data
    ? (treasuryHealth.data as { totalCommittedUnreleased: bigint }).totalCommittedUnreleased
    : null;
  const balance = treasuryHealth.data
    ? (treasuryHealth.data as { contractBalance: bigint }).contractBalance
    : null;
  const isHealthy = treasuryHealth.data
    ? (treasuryHealth.data as { isHealthy: boolean }).isHealthy
    : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Stat
        icon={Droplets}
        label="Streams visible"
        value={streams.length.toString()}
        accent="primary"
      />
      <Stat
        icon={Activity}
        label="Currently flowing"
        value={active.toString()}
        sub={active > 0 ? "live ticker" : "—"}
        accent="primary"
      />
      <Stat
        icon={PauseCircle}
        label="Held by agent"
        value={paused.toString()}
        sub={paused > 0 ? "auto-paused" : "—"}
        accent="paused"
      />
      <Stat
        icon={ShieldCheck}
        label="Treasury"
        value={
          balance !== null && committed !== null
            ? `${formatStt(balance, 0)} STT`
            : "—"
        }
        sub={
          isHealthy === null
            ? "checking…"
            : isHealthy
              ? "solvent"
              : "underfunded"
        }
        accent={isHealthy === false ? "destructive" : "success"}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "paused" | "success" | "destructive";
}) {
  const accentClass = {
    primary: "bg-primary/10 text-primary",
    paused: "bg-state-paused-bg text-state-paused",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
  }[accent];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span
          aria-hidden
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-xl",
            accentClass
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 font-numeric text-xl font-semibold tabular-nums sm:text-2xl">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}
