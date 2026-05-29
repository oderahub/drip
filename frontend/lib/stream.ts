/**
 * Shared types for stream lifecycle, mirroring contracts/Drip.sol.
 *
 * These mirrors are intentional — the on-chain enum order is fixed and
 * the frontend reads `streamStatus()` which returns a uint8. Using the
 * same names here keeps reads readable.
 */

import type { Address } from "viem";

export enum StreamStatus {
  None = 0,
  Active = 1,
  Paused = 2,
  Cancelled = 3,
  Completed = 4,
}

export const STATUS_LABEL: Record<StreamStatus, string> = {
  [StreamStatus.None]: "—",
  [StreamStatus.Active]: "Active",
  [StreamStatus.Paused]: "Paused",
  [StreamStatus.Cancelled]: "Cancelled",
  [StreamStatus.Completed]: "Completed",
};

/** Badge variant names from `components/ui/badge.tsx`. */
export const STATUS_BADGE: Record<
  StreamStatus,
  "active" | "paused" | "cancelled" | "completed" | "secondary"
> = {
  [StreamStatus.None]: "secondary",
  [StreamStatus.Active]: "active",
  [StreamStatus.Paused]: "paused",
  [StreamStatus.Cancelled]: "cancelled",
  [StreamStatus.Completed]: "completed",
};

/**
 * The shape returned by `Drip.streams(streamId)`. The auto-generated
 * getter on a public mapping of struct returns the fields as a tuple
 * (positional), in the order they appear in the Solidity struct.
 *
 *   struct Stream {
 *     address sender;
 *     address recipient;
 *     uint256 totalAmount;
 *     uint256 ratePerSecond;
 *     uint256 startTime;
 *     uint256 endTime;
 *     uint256 withdrawn;
 *     uint256 pausedAt;
 *     uint256 pausedAccumulated;
 *     StreamStatus status;       // uint8
 *   }
 */
export type StreamTuple = readonly [
  Address, // sender
  Address, // recipient
  bigint,  // totalAmount
  bigint,  // ratePerSecond
  bigint,  // startTime
  bigint,  // endTime
  bigint,  // withdrawn
  bigint,  // pausedAt
  bigint,  // pausedAccumulated
  number,  // status (uint8 -> number in viem)
];

export interface Stream {
  id: bigint;
  sender: Address;
  recipient: Address;
  totalAmount: bigint;
  ratePerSecond: bigint;
  startTime: bigint;
  endTime: bigint;
  withdrawn: bigint;
  pausedAt: bigint;
  pausedAccumulated: bigint;
  status: StreamStatus;
}

export function tupleToStream(id: bigint, t: StreamTuple): Stream {
  return {
    id,
    sender: t[0],
    recipient: t[1],
    totalAmount: t[2],
    ratePerSecond: t[3],
    startTime: t[4],
    endTime: t[5],
    withdrawn: t[6],
    pausedAt: t[7],
    pausedAccumulated: t[8],
    status: t[9] as StreamStatus,
  };
}

/* ------------------------------------------------------------------ */
/*  Pure math helpers — must mirror Drip._effectiveElapsed             */
/* ------------------------------------------------------------------ */

/** Effective elapsed seconds within [startTime, endTime], minus paused time. */
export function effectiveElapsedSec(s: Stream, nowSec: bigint): bigint {
  if (nowSec <= s.startTime) return 0n;
  const accrualEnd = nowSec < s.endTime ? nowSec : s.endTime;
  const totalSpan = accrualEnd - s.startTime;
  let pausedSpan = s.pausedAccumulated;
  if (s.status === StreamStatus.Paused && s.pausedAt < accrualEnd) {
    pausedSpan += accrualEnd - s.pausedAt;
  }
  if (pausedSpan >= totalSpan) return 0n;
  return totalSpan - pausedSpan;
}

/** Available balance for the recipient at `nowSec`. */
export function availableBalance(s: Stream, nowSec: bigint): bigint {
  if (
    s.status === StreamStatus.None ||
    s.status === StreamStatus.Cancelled ||
    s.status === StreamStatus.Completed
  ) {
    return 0n;
  }
  const accrued = s.ratePerSecond * effectiveElapsedSec(s, nowSec);
  if (accrued <= s.withdrawn) return 0n;
  return accrued - s.withdrawn;
}

/** Total streamed (accrued) at `nowSec`, including what's already withdrawn. */
export function streamedAmount(s: Stream, nowSec: bigint): bigint {
  if (s.status === StreamStatus.None) return 0n;
  return s.ratePerSecond * effectiveElapsedSec(s, nowSec);
}

/** 0–1 progress along the stream's accrual window. */
export function progressFraction(s: Stream, nowSec: bigint): number {
  const max = s.ratePerSecond * (s.endTime - s.startTime);
  if (max === 0n) return 0;
  const streamed = streamedAmount(s, nowSec);
  if (streamed >= max) return 1;
  // Convert to number for display only — we just need 4-5 sig figs.
  return Number((streamed * 10_000n) / max) / 10_000;
}

export function isTerminal(s: Stream): boolean {
  return s.status === StreamStatus.Cancelled || s.status === StreamStatus.Completed;
}
