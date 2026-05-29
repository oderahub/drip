"use client";

import * as React from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { availableBalance, type Stream, StreamStatus } from "@/lib/stream";
import { cn } from "@/lib/utils";

interface LiveBalanceProps {
  stream: Stream;
  /** Decimals of STT to show; default 4 — micro-STT precision is the
   *  goal but per-block ms-level changes feel like noise. */
  decimals?: number;
  /** Update cadence in ms — 1000 = once a second is plenty given how
   *  small one second of stream value typically is for demo amounts. */
  intervalMs?: number;
  className?: string;
}

const NUMBER_FMT: Format = {
  notation: "standard",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
};

/**
 * Animated STT-denominated balance. Tickers once a second by default;
 * if the stream is Paused / Cancelled / Completed the value freezes
 * (we still render — but no updates).
 */
export function LiveBalance({
  stream,
  decimals = 4,
  intervalMs = 1000,
  className,
}: LiveBalanceProps) {
  const [value, setValue] = React.useState<number>(() =>
    weiToFloat(availableBalance(stream, nowSec()), decimals)
  );

  React.useEffect(() => {
    if (stream.status !== StreamStatus.Active) {
      // Snap to the frozen value once and stop updating.
      setValue(weiToFloat(availableBalance(stream, nowSec()), decimals));
      return;
    }
    const tick = () => {
      setValue(weiToFloat(availableBalance(stream, nowSec()), decimals));
    };
    tick();
    const handle = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(handle);
  }, [stream, decimals, intervalMs]);

  const fmt: Format = React.useMemo(
    () => ({
      ...NUMBER_FMT,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    [decimals]
  );

  return (
    <span className={cn("font-numeric tabular-nums", className)}>
      <NumberFlow value={value} format={fmt} />
    </span>
  );
}

function nowSec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function weiToFloat(wei: bigint, decimals: number): number {
  // Avoid number precision loss for large amounts: do the scaling in BigInt,
  // then convert. Drip amounts are bounded for the demo so float is safe.
  const scaler = 10n ** BigInt(decimals);
  const scaled = (wei * scaler) / 10n ** 18n;
  return Number(scaled) / Number(scaler);
}
