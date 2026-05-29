"use client";

import * as React from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Log, PublicClient } from "viem";
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

/**
 * Resilient agent-decision feed for a single stream.
 *
 *   1. Historical backfill on mount via chunked `getLogs` (Somnia caps
 *      `eth_getLogs` at 1000 blocks → we walk in 999-block windows).
 *   2. Live: `watchContractEvent` on Drip and DripPolicies — WebSocket
 *      when the wagmi transport supports it, otherwise viem polls
 *      internally.
 *   3. Safety net: every 5 s we also `getLogs` from the last-seen
 *      block forward. Anything the WebSocket dropped during a brief
 *      disconnect lands here. All three sources push into the same
 *      dedup Map keyed by (blockHash, logIndex).
 *
 * Sort: every render returns the events sorted by (blockNumber,
 * logIndex) ascending after compaction (drops "PolicyActionTaken +
 * StreamPaused" same-tx duplicates etc.). Consumers reverse for
 * newest-first display.
 */

const MAX_HISTORICAL_BLOCKS = 10_000n; // ~17 min of history at 100 ms/block — enough for any demo cycle
const POLL_INTERVAL_MS = 5_000;
const LOG_CHUNK_SIZE = 999n;            // Somnia's getLogs cap is 1000 blocks
const TS_REFINE_PARALLELISM = 6;        // simultaneous block-timestamp lookups

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
  const byKeyRef = React.useRef(byKey);
  byKeyRef.current = byKey;
  const lastSeenBlockRef = React.useRef<bigint>(0n);
  const blockTsCacheRef = React.useRef<Map<string, number>>(new Map()); // blockNumber -> unix sec

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
    async (publicClient: PublicClient, records: NormalizedFeedEvent[]) => {
      const distinctBlocks = Array.from(new Set(records.map((r) => r.blockNumber.toString())));
      const cache = blockTsCacheRef.current;
      const toFetch = distinctBlocks.filter((b) => !cache.has(b));
      // Bounded-parallel fetch
      for (let i = 0; i < toFetch.length; i += TS_REFINE_PARALLELISM) {
        const slice = toFetch.slice(i, i + TS_REFINE_PARALLELISM);
        const results = await Promise.allSettled(
          slice.map((b) =>
            publicClient.getBlock({ blockNumber: BigInt(b), includeTransactions: false }),
          ),
        );
        results.forEach((res, idx) => {
          if (res.status === "fulfilled") {
            cache.set(slice[idx], Number(res.value.timestamp));
          }
        });
      }
      setByKey((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [k, r] of next) {
          const sec = cache.get(r.blockNumber.toString());
          if (sec && r.event.timestamp.getTime() !== sec * 1000) {
            // Replace the event's timestamp with the real block time.
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

  /** Chunked `getLogs` walker. */
  const fetchLogsWindow = React.useCallback(
    async (
      pc: PublicClient,
      fromBlock: bigint,
      toBlock: bigint,
    ): Promise<NormalizedFeedEvent[]> => {
      if (!targetStreamId) return [];
      const out: NormalizedFeedEvent[] = [];
      // Walk in 999-block chunks; gather logs from both contracts in each window.
      let cursor = fromBlock;
      while (cursor <= toBlock) {
        const end = cursor + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : cursor + LOG_CHUNK_SIZE - 1n;

        const [dripLogs, policyLogs] = await Promise.all([
          pc
            .getLogs({
              address: addrs.drip,
              events: dripAbi.filter((x) => x.type === "event") as unknown as readonly never[],
              fromBlock: cursor,
              toBlock: end,
            })
            .catch(() => [] as Log[]),
          pc
            .getLogs({
              address: addrs.dripPolicies,
              events: dripPoliciesAbi.filter((x) => x.type === "event") as unknown as readonly never[],
              fromBlock: cursor,
              toBlock: end,
            })
            .catch(() => [] as Log[]),
        ]);

        for (const raw of dripLogs) {
          const mapped = mapLogToFeedEvent(raw as Parameters<typeof mapLogToFeedEvent>[0], "drip");
          if (!mapped) continue;
          if (!logBelongsToStream(raw, targetStreamId)) continue;
          out.push(mapped);
        }
        for (const raw of policyLogs) {
          const mapped = mapLogToFeedEvent(raw as Parameters<typeof mapLogToFeedEvent>[0], "policies");
          if (!mapped) continue;
          if (!logBelongsToStream(raw, targetStreamId)) continue;
          out.push(mapped);
        }

        cursor = end + 1n;
      }
      return out;
    },
    [addrs.drip, addrs.dripPolicies, targetStreamId],
  );

  /* ──────────────────────────────────────────────────────────────── */
  /*  Mount: historical backfill                                       */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    setByKey(new Map());
    blockTsCacheRef.current = new Map();
    lastSeenBlockRef.current = 0n;

    (async () => {
      try {
        const head = await publicClient.getBlockNumber();
        const lower = head > MAX_HISTORICAL_BLOCKS ? head - MAX_HISTORICAL_BLOCKS : 0n;
        const records = await fetchLogsWindow(publicClient, lower, head);
        if (cancelled) return;
        ingest(records);
        // Best-effort timestamp refinement, runs in the background.
        void refineTimestamps(publicClient, records);
        lastSeenBlockRef.current = head;
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, targetStreamId, fetchLogsWindow, ingest, refineTimestamps]);

  /* ──────────────────────────────────────────────────────────────── */
  /*  Live subscriptions                                               */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId) return;
    setIsWatching(true);

    const handleLogs = (logs: Log[], source: "drip" | "policies") => {
      const records: NormalizedFeedEvent[] = [];
      for (const raw of logs) {
        const mapped = mapLogToFeedEvent(raw as Parameters<typeof mapLogToFeedEvent>[0], source);
        if (!mapped) continue;
        if (!logBelongsToStream(raw, targetStreamId)) continue;
        records.push(mapped);
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
  /*  Safety-net poll — every 5 s, getLogs from lastSeenBlock forward  */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const head = await publicClient.getBlockNumber();
        const last = lastSeenBlockRef.current;
        if (head <= last) return;
        const records = await fetchLogsWindow(publicClient, last + 1n, head);
        if (cancelled) return;
        ingest(records);
        void refineTimestamps(publicClient, records);
        lastSeenBlockRef.current = head;
      } catch {
        // Swallow — the next tick will retry. The watcher might still
        // be delivering; we only fail-open.
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
      // Force a full refresh.
      lastSeenBlockRef.current = 0n;
      setByKey(new Map());
      setIsLoadingHistory(true);
      void (async () => {
        const head = await publicClient.getBlockNumber();
        const lower = head > MAX_HISTORICAL_BLOCKS ? head - MAX_HISTORICAL_BLOCKS : 0n;
        const records = await fetchLogsWindow(publicClient, lower, head);
        ingest(records);
        void refineTimestamps(publicClient, records);
        setIsLoadingHistory(false);
      })();
    },
  };
}

/** Does this log's first indexed arg equal `streamId`? */
function logBelongsToStream(raw: Log, streamId: bigint): boolean {
  // Both contracts emit the stream-id as the first indexed argument.
  // viem decodes it into args.streamId when ABI is supplied.
  const decoded = raw as Log & { args?: { streamId?: bigint } };
  if (decoded.args && typeof decoded.args.streamId === "bigint") {
    return decoded.args.streamId === streamId;
  }
  // Fallback: read from topics[1] directly.
  const topic1 = raw.topics?.[1];
  if (!topic1) return false;
  try {
    return BigInt(topic1) === streamId;
  } catch {
    return false;
  }
}
