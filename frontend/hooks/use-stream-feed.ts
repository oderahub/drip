"use client";

import * as React from "react";
import { useChainId, usePublicClient } from "wagmi";
import { decodeEventLog, type AbiEvent, type Log, type PublicClient } from "viem";
import { dripAbi } from "@/lib/abi/drip";
import { dripPoliciesAbi } from "@/lib/abi/drip-policies";
import { ADDRESSES } from "@/lib/contracts";
import {
  compact,
  dedupKey,
  mapLogToFeedEvent,
  sortFeed,
  type NormalizedFeedEvent,
} from "@/lib/event-mapping";
import { fetchAllLogs, filterByStreamId, type RawLog } from "@/lib/explorer-api";

/**
 * Resilient agent-decision feed for a single stream.
 *
 *   1. Historical backfill on mount via Blockscout's `/api/v2/addresses/
 *      {addr}/logs` (paginated, no block-range cap). Somnia's JSON-RPC
 *      caps `eth_getLogs` at 1000 blocks, so for a stream that's
 *      hours/days old we cannot use RPC for the full history.
 *   2. Live: viem's `watchContractEvent` on both contracts. Uses the
 *      configured transport — WebSocket-preferred where available, with
 *      viem's internal polling fallback otherwise.
 *   3. Safety net: every 5 s we also `getLogs` from the last-seen
 *      block forward. Anything the WebSocket dropped during a brief
 *      disconnect lands here. All three sources push into a single
 *      dedup Map keyed by (blockHash, logIndex).
 *
 * Sort: every render returns the events sorted by (blockNumber,
 * logIndex) ascending after compaction (drops "PolicyActionTaken +
 * StreamPaused" same-tx duplicates etc.). Consumers reverse for
 * newest-first display.
 */

const POLL_INTERVAL_MS = 5_000;
const LOG_CHUNK_SIZE = 999n;            // Somnia getLogs cap is 1000 blocks
const SAFETY_NET_LOOKBACK = 2_000n;     // How far back the 5 s poll scans
const TS_REFINE_PARALLELISM = 6;

export interface UseStreamFeedResult {
  events: NormalizedFeedEvent[];        // sorted ascending, compacted
  isLoadingHistory: boolean;
  isWatching: boolean;
  refetch: () => void;
}

export function useStreamFeed(streamId: bigint | null | undefined): UseStreamFeedResult {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const addrs = chainId === 5031 ? ADDRESSES.mainnet : ADDRESSES.testnet;

  const [byKey, setByKey] = React.useState<Map<string, NormalizedFeedEvent>>(new Map());
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(true);
  const [isWatching, setIsWatching] = React.useState(false);

  // Refs so the long-lived intervals + watchers don't see stale state.
  const lastSeenBlockRef = React.useRef<bigint>(0n);
  const blockTsCacheRef = React.useRef<Map<string, number>>(new Map());

  const targetStreamId = streamId ?? null;

  /** Push a batch of mapped + chain-side-tagged records into the dedup Map. */
  const ingest = React.useCallback((records: NormalizedFeedEvent[]) => {
    if (records.length === 0) return;
    setByKey((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const r of records) {
        const k = dedupKey(r);
        if (next.has(k)) continue;
        next.set(k, r);
        changed = true;
        if (r.blockNumber > lastSeenBlockRef.current) lastSeenBlockRef.current = r.blockNumber;
      }
      return changed ? next : prev;
    });
  }, []);

  /** Refine event.timestamp from chain block timestamps (best effort). */
  const refineTimestamps = React.useCallback(
    async (pc: PublicClient, records: NormalizedFeedEvent[]) => {
      const distinctBlocks = Array.from(new Set(records.map((r) => r.blockNumber.toString())));
      const cache = blockTsCacheRef.current;
      const toFetch = distinctBlocks.filter((b) => !cache.has(b));
      for (let i = 0; i < toFetch.length; i += TS_REFINE_PARALLELISM) {
        const slice = toFetch.slice(i, i + TS_REFINE_PARALLELISM);
        const results = await Promise.allSettled(
          slice.map((b) =>
            pc.getBlock({ blockNumber: BigInt(b), includeTransactions: false }),
          ),
        );
        results.forEach((res, idx) => {
          if (res.status === "fulfilled") cache.set(slice[idx], Number(res.value.timestamp));
        });
      }
      setByKey((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [k, r] of next) {
          const sec = cache.get(r.blockNumber.toString());
          if (sec && r.event.timestamp.getTime() !== sec * 1000) {
            const refinedEvent = { ...r.event, timestamp: new Date(sec * 1000) };
            next.set(k, { ...r, event: refinedEvent as typeof r.event });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [],
  );

  /**
   * Decode a Blockscout-shape raw log against an ABI, returning a viem-
   * style decoded log that `mapLogToFeedEvent` understands.
   */
  const decodeRaw = React.useCallback(
    (raw: RawLog, abi: typeof dripAbi | typeof dripPoliciesAbi): Parameters<typeof mapLogToFeedEvent>[0] | null => {
      try {
        const dec = decodeEventLog({
          abi: abi as readonly AbiEvent[],
          data: raw.data,
          topics: raw.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        });
        return {
          ...raw,
          eventName: dec.eventName,
          args: dec.args as Record<string, unknown>,
          // viem Log shape has these, fill with sane defaults
          removed: false,
          transactionIndex: 0,
        } as unknown as Parameters<typeof mapLogToFeedEvent>[0];
      } catch {
        return null;
      }
    },
    [],
  );

  /** Decode + filter + map a batch of raw Blockscout logs from one contract. */
  const ingestRawLogs = React.useCallback(
    (logs: RawLog[], source: "drip" | "policies", streamId: bigint) => {
      const filtered = filterByStreamId(logs, streamId);
      const records: NormalizedFeedEvent[] = [];
      const abi = source === "drip" ? dripAbi : dripPoliciesAbi;
      for (const raw of filtered) {
        const decoded = decodeRaw(raw, abi);
        if (!decoded) continue;
        const mapped = mapLogToFeedEvent(decoded, source);
        if (mapped) records.push(mapped);
      }
      ingest(records);
      return records;
    },
    [decodeRaw, ingest],
  );

  /** RPC-chunked `getLogs` walker — used only for the live safety-net poll. */
  const fetchLogsWindow = React.useCallback(
    async (pc: PublicClient, fromBlock: bigint, toBlock: bigint, streamId: bigint) => {
      const records: NormalizedFeedEvent[] = [];
      let cursor = fromBlock;
      while (cursor <= toBlock) {
        const end = cursor + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : cursor + LOG_CHUNK_SIZE - 1n;
        const [dripLogs, policyLogs] = await Promise.all([
          pc.getLogs({ address: addrs.drip, fromBlock: cursor, toBlock: end }).catch(() => [] as Log[]),
          pc.getLogs({ address: addrs.dripPolicies, fromBlock: cursor, toBlock: end }).catch(() => [] as Log[]),
        ]);
        for (const raw of dripLogs) {
          const decoded = decodeViemLog(raw, dripAbi);
          if (!decoded) continue;
          if (!logBelongsToStream(decoded, streamId)) continue;
          const m = mapLogToFeedEvent(decoded, "drip");
          if (m) records.push(m);
        }
        for (const raw of policyLogs) {
          const decoded = decodeViemLog(raw, dripPoliciesAbi);
          if (!decoded) continue;
          if (!logBelongsToStream(decoded, streamId)) continue;
          const m = mapLogToFeedEvent(decoded, "policies");
          if (m) records.push(m);
        }
        cursor = end + 1n;
      }
      return records;
    },
    [addrs.drip, addrs.dripPolicies],
  );

  /* ──────────────────────────────────────────────────────────────── */
  /*  Mount: historical backfill via Blockscout                        */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    setByKey(new Map());
    blockTsCacheRef.current = new Map();
    lastSeenBlockRef.current = 0n;
    const sid = targetStreamId;

    (async () => {
      try {
        // Run both contract fetches in parallel.
        const [dripLogs, policyLogs] = await Promise.all([
          fetchAllLogs({ chainId, address: addrs.drip }),
          fetchAllLogs({ chainId, address: addrs.dripPolicies }),
        ]);
        if (cancelled) return;
        const dripRecords = ingestRawLogs(dripLogs, "drip", sid);
        const policyRecords = ingestRawLogs(policyLogs, "policies", sid);
        const all = [...dripRecords, ...policyRecords];
        // Best-effort timestamp refinement runs in the background.
        if (all.length > 0) void refineTimestamps(publicClient, all);
        // Track the highest block we've seen so the safety-net poll
        // doesn't redundantly walk through history.
        const head = await publicClient.getBlockNumber();
        if (!cancelled) lastSeenBlockRef.current = head;
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, targetStreamId, chainId, addrs.drip, addrs.dripPolicies, ingestRawLogs, refineTimestamps]);

  /* ──────────────────────────────────────────────────────────────── */
  /*  Live subscriptions                                               */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId) return;
    const sid = targetStreamId;
    setIsWatching(true);

    const handleLogs = (logs: Log[], source: "drip" | "policies") => {
      const abi = source === "drip" ? dripAbi : dripPoliciesAbi;
      const records: NormalizedFeedEvent[] = [];
      for (const raw of logs) {
        const decoded = decodeViemLog(raw, abi);
        if (!decoded) continue;
        if (!logBelongsToStream(decoded, sid)) continue;
        const m = mapLogToFeedEvent(decoded, source);
        if (m) records.push(m);
      }
      if (records.length > 0) {
        ingest(records);
        void refineTimestamps(publicClient, records);
      }
    };

    const unwatchDrip = publicClient.watchContractEvent({
      address: addrs.drip,
      abi: dripAbi,
      onLogs: (logs) => handleLogs(logs as unknown as Log[], "drip"),
      pollingInterval: 4_000,
    });
    const unwatchPolicies = publicClient.watchContractEvent({
      address: addrs.dripPolicies,
      abi: dripPoliciesAbi,
      onLogs: (logs) => handleLogs(logs as unknown as Log[], "policies"),
      pollingInterval: 4_000,
    });

    return () => {
      setIsWatching(false);
      unwatchDrip();
      unwatchPolicies();
    };
  }, [publicClient, targetStreamId, addrs.drip, addrs.dripPolicies, ingest, refineTimestamps]);

  /* ──────────────────────────────────────────────────────────────── */
  /*  Safety-net poll — every 5 s, getLogs over the most recent window */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId) return;
    const sid = targetStreamId;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const head = await publicClient.getBlockNumber();
        const last = lastSeenBlockRef.current;
        const fromBlock = last > 0n ? last + 1n : (head > SAFETY_NET_LOOKBACK ? head - SAFETY_NET_LOOKBACK : 0n);
        if (head < fromBlock) return;
        const records = await fetchLogsWindow(publicClient, fromBlock, head, sid);
        if (cancelled) return;
        ingest(records);
        if (records.length > 0) void refineTimestamps(publicClient, records);
        lastSeenBlockRef.current = head;
      } catch {
        // Swallow — next tick retries. The watcher may still be delivering.
      }
    };

    const handle = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [publicClient, targetStreamId, fetchLogsWindow, ingest, refineTimestamps]);

  const events = React.useMemo(() => compact(sortFeed(Array.from(byKey.values()))), [byKey]);

  return {
    events,
    isLoadingHistory,
    isWatching,
    refetch: () => {
      if (!publicClient || !targetStreamId) return;
      lastSeenBlockRef.current = 0n;
      setByKey(new Map());
      setIsLoadingHistory(true);
      const sid = targetStreamId;
      void (async () => {
        try {
          const [dripLogs, policyLogs] = await Promise.all([
            fetchAllLogs({ chainId, address: addrs.drip }),
            fetchAllLogs({ chainId, address: addrs.dripPolicies }),
          ]);
          const all = [
            ...ingestRawLogs(dripLogs, "drip", sid),
            ...ingestRawLogs(policyLogs, "policies", sid),
          ];
          if (all.length > 0) void refineTimestamps(publicClient, all);
          const head = await publicClient.getBlockNumber();
          lastSeenBlockRef.current = head;
        } finally {
          setIsLoadingHistory(false);
        }
      })();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Local viem-log decoder + streamId filter                            */
/* ------------------------------------------------------------------ */

function decodeViemLog(
  raw: Log,
  abi: typeof dripAbi | typeof dripPoliciesAbi,
): Parameters<typeof mapLogToFeedEvent>[0] | null {
  try {
    const dec = decodeEventLog({
      abi: abi as readonly AbiEvent[],
      data: raw.data,
      topics: raw.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
    });
    return { ...raw, eventName: dec.eventName, args: dec.args } as unknown as Parameters<typeof mapLogToFeedEvent>[0];
  } catch {
    return null;
  }
}

function logBelongsToStream(decoded: { args?: Record<string, unknown>; topics?: readonly (`0x${string}` | null)[] }, streamId: bigint): boolean {
  const sid = decoded.args?.streamId;
  if (typeof sid === "bigint") return sid === streamId;
  const topic1 = decoded.topics?.[1];
  if (!topic1) return false;
  try {
    return BigInt(topic1) === streamId;
  } catch {
    return false;
  }
}
