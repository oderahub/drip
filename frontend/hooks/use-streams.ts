"use client";

import * as React from "react";
import { useReadContract, useReadContracts, useAccount, useChainId } from "wagmi";
import { dripAbi } from "@/lib/abi/drip";
import { ADDRESSES } from "@/lib/contracts";
import {
  tupleToStream,
  type Stream,
  type StreamTuple,
} from "@/lib/stream";

/**
 * Load all streams from the deployed Drip contract on the active chain.
 *
 * Two-phase:
 *   1. Read `nextStreamId` to learn how many streams exist (IDs 1..N-1).
 *   2. Multi-call `streams(streamId)` for every ID in one batched RPC.
 *
 * The TanStack Query cache wagmi sits on top of revalidates this
 * automatically on every new block (default behaviour). For the
 * dashboard's stat cards + ticker we re-derive everything from the
 * cached array — no per-stream subscriptions.
 */
export function useAllStreams() {
  const chainId = useChainId();
  const addr = chainId === 5031 ? ADDRESSES.mainnet.drip : ADDRESSES.testnet.drip;

  const nextStreamIdQuery = useReadContract({
    address: addr,
    abi: dripAbi,
    functionName: "nextStreamId",
    query: { refetchInterval: 8_000 },
  });

  const totalStreams = nextStreamIdQuery.data ? Number(nextStreamIdQuery.data) - 1 : 0;

  const contracts = React.useMemo(
    () =>
      Array.from({ length: totalStreams }, (_, i) => ({
        address: addr,
        abi: dripAbi,
        functionName: "streams" as const,
        args: [BigInt(i + 1)] as const,
      })),
    [addr, totalStreams]
  );

  const streamsQuery = useReadContracts({
    contracts,
    query: {
      enabled: totalStreams > 0,
      refetchInterval: 8_000,
    },
  });

  const streams = React.useMemo<Stream[]>(() => {
    if (!streamsQuery.data) return [];
    return streamsQuery.data
      .map((r, i) =>
        r.status === "success" && r.result
          ? tupleToStream(BigInt(i + 1), r.result as unknown as StreamTuple)
          : null
      )
      .filter((s): s is Stream => s !== null);
  }, [streamsQuery.data]);

  return {
    streams,
    isLoading:
      nextStreamIdQuery.isPending ||
      (totalStreams > 0 && streamsQuery.isPending),
    isError: nextStreamIdQuery.isError || streamsQuery.isError,
    refetch: () => {
      nextStreamIdQuery.refetch();
      streamsQuery.refetch();
    },
  };
}

/**
 * Partition all streams by the connected wallet's relationship to them.
 *   - mine: sender OR recipient
 *   - sent: sender
 *   - received: recipient
 *   - all: everything (used as the global teaser when not connected)
 */
export function useMyStreams() {
  const { address, isConnected } = useAccount();
  const all = useAllStreams();

  return React.useMemo(() => {
    const lower = address?.toLowerCase();
    const mine = lower
      ? all.streams.filter(
          (s) => s.sender.toLowerCase() === lower || s.recipient.toLowerCase() === lower
        )
      : [];
    const sent = lower
      ? all.streams.filter((s) => s.sender.toLowerCase() === lower)
      : [];
    const received = lower
      ? all.streams.filter((s) => s.recipient.toLowerCase() === lower)
      : [];
    return {
      ...all,
      isConnected,
      mine,
      sent,
      received,
    };
  }, [all, address, isConnected]);
}
