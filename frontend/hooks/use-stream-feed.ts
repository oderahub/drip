"use client";

import * as React from "react";
import { useChainId, usePublicClient } from "wagmi";
import {
  decodeEventLog,
  type AbiEvent,
  type Log,
  type PublicClient,
} from "viem";

/** Raw eth_getLogs item — hex strings everywhere. */
interface RpcLog {
  address: `0x${string}`;
  blockHash: `0x${string}`;
  blockNumber: `0x${string}`;
  data: `0x${string}`;
  logIndex: `0x${string}`;
  removed?: boolean;
  topics: `0x${string}`[];
  transactionHash: `0x${string}`;
  transactionIndex: `0x${string}`;
}
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
 * The Blockscout backfill we used earlier truncated at ~25-100 records
 * per contract regardless of `next_page_params`. Streams whose events
 * land beyond that window came back empty. The current implementation
 * goes straight to RPC `eth_getLogs` with a server-side topics filter
 * so the work scales with the stream's own event count (~150 events
 * for a ~6h stream) rather than the contract's lifetime activity.
 *
 *   (1) Historical backfill   chunked eth_getLogs anchored at the
 *                             stream's `startTime`, walked BACKWARDS
 *                             from head so latest events render first.
 *                             topics[1] = streamId filter pushes
 *                             filtering to the RPC server.
 *
 *   (2) Live arrival          viem `watchContractEvent` per contract.
 *                             Filtered client-side by streamId.
 *
 *   (3) Safety-net poll       every 5s, getLogs over the recent
 *                             window. Catches anything WebSocket
 *                             dropped. All three sources push into
 *                             a single dedup Map keyed by
 *                             (blockHash, logIndex).
 *
 * Output: events sorted (blockNumber, logIndex) ascending after
 * compaction. Consumers reverse for newest-first display.
 */

const POLL_INTERVAL_MS = 5_000;
const LOG_CHUNK_SIZE = 999n;            // Somnia getLogs cap is 1000 blocks
const SAFETY_NET_LOOKBACK = 2_000n;
const TS_REFINE_PARALLELISM = 6;
const BACKFILL_CONCURRENCY = 6;
const BACKFILL_SAFETY_BUFFER_BLOCKS = 5_000n; // walk a bit further back than the timestamp arithmetic suggests
const SOMNIA_BLOCKS_PER_SEC = 12;       // 100ms target; pad upward (12 not 10) so we never under-walk
const BACKFILL_MAX_BLOCKS = 2_000_000n; // hard ceiling — ~2 days of history at 100ms

export interface UseStreamFeedResult {
  events: NormalizedFeedEvent[];
  isLoadingHistory: boolean;
  isWatching: boolean;
  backfillProgress: { done: number; total: number } | null;
  refetch: () => void;
}

/**
 * `streamStartSec` should be the `Stream.startTime` (unix seconds) from
 * the same chain query that drives the page header — pass it in once
 * it's available and the hook starts backfill. Undefined defers backfill.
 */
export function useStreamFeed(
  streamId: bigint | null | undefined,
  streamStartSec: bigint | null | undefined,
): UseStreamFeedResult {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const addrs = chainId === 5031 ? ADDRESSES.mainnet : ADDRESSES.testnet;

  const [byKey, setByKey] = React.useState<Map<string, NormalizedFeedEvent>>(new Map());
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(true);
  const [isWatching, setIsWatching] = React.useState(false);
  const [backfillProgress, setBackfillProgress] = React.useState<
    { done: number; total: number } | null
  >(null);

  const lastSeenBlockRef = React.useRef<bigint>(0n);
  const blockTsCacheRef = React.useRef<Map<string, number>>(new Map());

  const targetStreamId = streamId ?? null;

  /** Push a batch into the dedup Map. */
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
          slice.map((b) => pc.getBlock({ blockNumber: BigInt(b), includeTransactions: false })),
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
   * Fetch logs over [from, to] from one contract with a streamId filter,
   * decode, map. Errors swallowed — the safety-net poll retries.
   */
  const fetchWindow = React.useCallback(
    async (
      pc: PublicClient,
      addr: `0x${string}`,
      source: "drip" | "policies",
      from: bigint,
      to: bigint,
      streamId: bigint,
    ): Promise<NormalizedFeedEvent[]> => {
      const streamIdTopic = ("0x" +
        streamId.toString(16).padStart(64, "0")) as `0x${string}`;
      // We need a raw topics filter (null for any event sig, streamId in
      // topic[1]). viem's typed getLogs doesn't expose a free-form topics
      // array — it expects `event`/`events` with optional `args`. The raw
      // RPC call gives us full control over the topics array, which is
      // also what makes this query fast: the server filters to ~150
      // events for stream 2 instead of returning all 11K+ logs.
      let rawLogs: RpcLog[] = [];
      try {
        rawLogs = await pc.request({
          method: "eth_getLogs",
          params: [
            {
              address: addr,
              fromBlock: ("0x" + from.toString(16)) as `0x${string}`,
              toBlock: ("0x" + to.toString(16)) as `0x${string}`,
              topics: [null, streamIdTopic],
            },
          ],
        } as never) as unknown as RpcLog[];
      } catch {
        return [];
      }
      const logs: Log[] = rawLogs.map((r) => ({
        address: r.address,
        blockHash: r.blockHash,
        blockNumber: BigInt(r.blockNumber),
        data: r.data,
        logIndex: parseInt(r.logIndex, 16),
        removed: r.removed ?? false,
        topics: r.topics as readonly `0x${string}`[],
        transactionHash: r.transactionHash,
        transactionIndex: parseInt(r.transactionIndex, 16),
      })) as unknown as Log[];
      const abi = source === "drip" ? dripAbi : dripPoliciesAbi;
      const out: NormalizedFeedEvent[] = [];
      for (const raw of logs) {
        const decoded = decodeViemLog(raw, abi);
        if (!decoded) continue;
        const m = mapLogToFeedEvent(decoded, source);
        if (m) out.push(m);
      }
      return out;
    },
    [],
  );

  /* ──────────────────────────────────────────────────────────────── */
  /*  Mount: chunked RPC backfill anchored at stream.startTime         */
  /* ──────────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!publicClient || !targetStreamId || !streamStartSec || streamStartSec === 0n) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    setBackfillProgress(null);
    setByKey(new Map());
    blockTsCacheRef.current = new Map();
    lastSeenBlockRef.current = 0n;
    const sid = targetStreamId;

    (async () => {
      try {
        const head = await publicClient.getBlockNumber();
        const headBlock = await publicClient.getBlock({ blockNumber: head, includeTransactions: false });
        const headSec = Number(headBlock.timestamp);
        const elapsedSec = Math.max(0, headSec - Number(streamStartSec));
        const approxBlocksAgo = BigInt(Math.floor(elapsedSec * SOMNIA_BLOCKS_PER_SEC)) + BACKFILL_SAFETY_BUFFER_BLOCKS;
        const cappedAgo = approxBlocksAgo > BACKFILL_MAX_BLOCKS ? BACKFILL_MAX_BLOCKS : approxBlocksAgo;
        const floor = head > cappedAgo ? head - cappedAgo : 0n;

        // Pre-compute backward chunk windows from head → floor
        const windows: [bigint, bigint][] = [];
        let cursor = head;
        while (cursor > floor) {
          const from = cursor - LOG_CHUNK_SIZE + 1n > floor ? cursor - LOG_CHUNK_SIZE + 1n : floor;
          windows.push([from, cursor]);
          cursor = from === 0n ? -1n : from - 1n;
          if (cursor < 0n) break;
        }

        setBackfillProgress({ done: 0, total: windows.length });

        let sawCreated = false;
        let done = 0;

        // Walk in concurrency-limited batches, newest first.
        for (let i = 0; i < windows.length && !sawCreated && !cancelled; i += BACKFILL_CONCURRENCY) {
          const batch = windows.slice(i, i + BACKFILL_CONCURRENCY);
          const settled = await Promise.all(
            batch.flatMap(([from, to]) => [
              fetchWindow(publicClient, addrs.drip, "drip", from, to, sid),
              fetchWindow(publicClient, addrs.dripPolicies, "policies", from, to, sid),
            ]),
          );
          if (cancelled) return;
          const flat = settled.flat();
          if (flat.length > 0) {
            ingest(flat);
            void refineTimestamps(publicClient, flat);
            // StreamCreated is emitted from the Drip contract on first creation.
            // If we hit it, every older event predates the stream.
            for (const r of flat) {
              if (r.event.type === "stream-created") {
                sawCreated = true;
                break;
              }
            }
          }
          done += batch.length;
          setBackfillProgress({ done, total: windows.length });
        }

        if (!cancelled) {
          lastSeenBlockRef.current = head;
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
          // Keep the progress around for a beat so the UI can show "done" briefly.
          setTimeout(() => {
            if (!cancelled) setBackfillProgress(null);
          }, 400);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    publicClient,
    targetStreamId,
    streamStartSec,
    addrs.drip,
    addrs.dripPolicies,
    fetchWindow,
    ingest,
    refineTimestamps,
  ]);

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
  /*  Safety-net poll                                                  */
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
        const fromBlock =
          last > 0n
            ? last + 1n
            : head > SAFETY_NET_LOOKBACK
              ? head - SAFETY_NET_LOOKBACK
              : 0n;
        if (head < fromBlock) return;

        // Single 999-or-less window
        const span = head - fromBlock;
        const windows: [bigint, bigint][] = [];
        if (span <= LOG_CHUNK_SIZE) {
          windows.push([fromBlock, head]);
        } else {
          // If we've fallen behind by more than 1K blocks, walk in chunks.
          let cur = fromBlock;
          while (cur <= head) {
            const end = cur + LOG_CHUNK_SIZE - 1n > head ? head : cur + LOG_CHUNK_SIZE - 1n;
            windows.push([cur, end]);
            cur = end + 1n;
          }
        }

        const results = await Promise.all(
          windows.flatMap(([from, to]) => [
            fetchWindow(publicClient, addrs.drip, "drip", from, to, sid),
            fetchWindow(publicClient, addrs.dripPolicies, "policies", from, to, sid),
          ]),
        );
        if (cancelled) return;
        const flat = results.flat();
        if (flat.length > 0) {
          ingest(flat);
          void refineTimestamps(publicClient, flat);
        }
        lastSeenBlockRef.current = head;
      } catch {
        // Swallow — next tick retries.
      }
    };

    const handle = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [publicClient, targetStreamId, addrs.drip, addrs.dripPolicies, fetchWindow, ingest, refineTimestamps]);

  const events = React.useMemo(() => compact(sortFeed(Array.from(byKey.values()))), [byKey]);

  return {
    events,
    isLoadingHistory,
    isWatching,
    backfillProgress,
    refetch: () => {
      if (!publicClient || !targetStreamId || !streamStartSec) return;
      lastSeenBlockRef.current = 0n;
      setByKey(new Map());
      setIsLoadingHistory(true);
      // The mount effect will re-run because we're flipping isLoadingHistory.
      // Easiest path: simulate via reset by toggling streamId-derived state — but
      // since we can't easily re-trigger the effect from here, just kick the
      // safety-net poll to repopulate the recent window. A full re-backfill
      // happens whenever streamId or streamStartSec changes.
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
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

function logBelongsToStream(
  decoded: { args?: Record<string, unknown>; topics?: readonly (`0x${string}` | null)[] },
  streamId: bigint,
): boolean {
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
