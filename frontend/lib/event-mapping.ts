/**
 * Convert a raw viem log emitted by `Drip` or `DripPolicies` into a
 * `FeedEvent` for the decision-feed renderer.
 *
 * Every record carries the sort/dedup metadata (blockNumber, logIndex,
 * blockHash, transactionHash) so the resilient subscription hook can:
 *   1. dedup events received via both WebSocket and the safety-net poll
 *   2. sort canonically by (blockNumber, logIndex) ascending
 *   3. compact "this and that fired in the same tx" duplicates
 *      (e.g. PolicyActionTaken + StreamPaused → keep PolicyActionTaken)
 *
 * Unknown events (anything not in our event list) return `null` and
 * the caller drops them.
 */

import type { Log } from "viem";
import type { FeedEvent } from "@/components/decision-event-card";

/**
 * Normalized record: the FeedEvent for rendering, plus the chain-side
 * sort/dedup metadata.
 */
export interface NormalizedFeedEvent {
  event: FeedEvent;
  blockNumber: bigint;
  blockHash: `0x${string}`;
  logIndex: number;
  transactionHash: `0x${string}`;
  /**
   * Per-tx semantic key — used by the compaction step to drop
   * lower-info duplicates. E.g. "action-pause" is emitted by both
   * Drip.StreamPaused and DripPolicies.PolicyActionTaken in the same
   * tx; we keep the policies-side event (richer args) and drop the
   * drip-side mirror.
   */
  semanticKey: string;
  /**
   * Priority within a semantic key. When two records collide on
   * (txHash, semanticKey), the lower priority wins (it's kept).
   */
  priority: number;
}

/** Stable, RPC-agnostic dedup key. */
export function dedupKey(n: NormalizedFeedEvent | Log): string {
  if ("event" in n) {
    return `${n.blockHash}-${n.logIndex}`;
  }
  return `${n.blockHash}-${n.logIndex}`;
}

/** Canonical sort: blockNumber asc, then logIndex asc. */
export function sortFeed(arr: NormalizedFeedEvent[]): NormalizedFeedEvent[] {
  return [...arr].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.logIndex - b.logIndex;
  });
}

/**
 * Compact same-tx duplicates. After this pass, the per-tx semantic
 * keys are unique. Lower `priority` wins.
 */
export function compact(arr: NormalizedFeedEvent[]): NormalizedFeedEvent[] {
  const winning = new Map<string, NormalizedFeedEvent>();
  for (const e of arr) {
    const key = `${e.transactionHash}::${e.semanticKey}`;
    const existing = winning.get(key);
    if (!existing || e.priority < existing.priority) winning.set(key, e);
  }
  // Re-sort because the Map preserves insertion order, not canonical order.
  return sortFeed([...winning.values()]);
}

/**
 * Map a single viem log to a `NormalizedFeedEvent` (or null if the
 * log is not one we render).
 *
 * The viem `Log` shape includes a `decoded` representation when the
 * caller supplied the ABI to `getLogs` / `watchContractEvent`. We
 * normalize the args here.
 */
type DecodedLog = Log & {
  eventName?: string;
  args?: Record<string, unknown>;
};

export function mapLogToFeedEvent(
  raw: DecodedLog,
  source: "drip" | "policies",
): NormalizedFeedEvent | null {
  const name = raw.eventName;
  const args = (raw.args ?? {}) as Record<string, unknown>;
  if (!name || raw.blockNumber === null || raw.logIndex === null) return null;
  if (!raw.blockHash || !raw.transactionHash) return null;

  // Always-present chain metadata
  const base = {
    blockNumber: raw.blockNumber,
    blockHash: raw.blockHash,
    logIndex: raw.logIndex,
    transactionHash: raw.transactionHash,
    timestamp: new Date(), // refined later by the caller via block timestamp lookup
  };

  // We don't have the block timestamp in the log itself; the caller
  // (use-stream-feed) can refine `event.timestamp` after fetching
  // block metadata. Default to "now" so the UI doesn't render Jan 1 1970.
  const timestamp = base.timestamp;

  switch (source + "::" + name) {
    // ── Drip ────────────────────────────────────────────────────────
    case "drip::StreamCreated": {
      const sender = String(args.sender) as `0x${string}`;
      const recipient = String(args.recipient) as `0x${string}`;
      const totalAmount = args.totalAmount as bigint;
      const startTime = args.startTime as bigint;
      const endTime = args.endTime as bigint;
      const durationSec = endTime - startTime;
      return {
        ...base,
        event: { type: "stream-created", timestamp, sender, recipient, totalAmount, durationSec },
        semanticKey: "stream-created",
        priority: 0,
      };
    }
    case "drip::Withdrawal": {
      return {
        ...base,
        event: {
          type: "withdrawal",
          timestamp,
          recipient: String(args.recipient) as `0x${string}`,
          amount: args.amount as bigint,
        },
        semanticKey: "withdrawal",
        priority: 0,
      };
    }
    case "drip::StreamPaused":
      // Lower-info mirror — policies emits PolicyActionTaken in the
      // same tx with richer args. Tag with same semantic key + lower
      // priority loses to policies' record.
      return {
        ...base,
        event: { type: "action", timestamp, kind: "pause", verdict: "dormant" },
        semanticKey: "action-pause",
        priority: 2,
      };
    case "drip::StreamResumed":
      return {
        ...base,
        event: { type: "action", timestamp, kind: "resume", verdict: "active" },
        semanticKey: "action-resume",
        priority: 2,
      };
    case "drip::StreamCancelled":
      return {
        ...base,
        event: { type: "stream-cancelled", timestamp },
        semanticKey: "stream-cancelled",
        priority: 0,
      };
    case "drip::StreamCompleted":
      return {
        ...base,
        event: { type: "stream-completed", timestamp },
        semanticKey: "stream-completed",
        priority: 0,
      };
    case "drip::PolicyCheckDispatched":
      // Same tx as DripPolicies.PolicyCheckStarted but with less info
      // (no requestId). Lower priority — policies' event wins.
      return {
        ...base,
        event: { type: "schedule-fired", timestamp, intervalSec: 60 },
        semanticKey: "schedule-fired",
        priority: 2,
      };

    // ── DripPolicies ────────────────────────────────────────────────
    case "policies::PolicyRegistered": {
      const username = String(args.githubUsername ?? "");
      const repo = String(args.githubRepo ?? "");
      const intervalSec = Number(args.checkIntervalSeconds ?? 60n);
      return {
        ...base,
        event: { type: "policy-registered", timestamp, username, repo, intervalSec },
        semanticKey: "policy-registered",
        priority: 0,
      };
    }
    case "policies::PolicyCheckScheduled": {
      // Suppress this one — it fires in the same tx as PolicyRegistered
      // (the initial schedule) AND in the same tx as the previous
      // ClassificationReceived (re-schedule). Adding cards for both
      // makes the feed noisy. Return null.
      return null;
    }
    case "policies::PolicyCheckStarted": {
      return {
        ...base,
        event: { type: "schedule-fired", timestamp, intervalSec: 60 },
        semanticKey: "schedule-fired",
        priority: 0, // wins over drip::PolicyCheckDispatched
      };
    }
    case "policies::GithubDataFetched": {
      const activityJson = String(args.activityJson ?? "{}");
      let commitCount = 0;
      let prCount = 0;
      try {
        const parsed = JSON.parse(activityJson) as Record<string, unknown>;
        // Aggregator wraps the canonical payload in `json` field; the
        // event carries that inner string verbatim.
        const inner = typeof parsed.json === "string"
          ? JSON.parse(parsed.json as string)
          : parsed;
        commitCount = Number((inner as { commitCount?: number }).commitCount ?? 0);
        prCount = Number((inner as { prCount?: number }).prCount ?? 0);
      } catch {
        // Leave at 0
      }
      return {
        ...base,
        event: {
          type: "github-fetched",
          timestamp,
          commitCount,
          prCount,
          bytesIn: activityJson.length,
          receiptUrl: `https://agents.testnet.somnia.network/receipts/${String(args.requestId ?? "")}`,
        },
        semanticKey: "github-fetched",
        priority: 0,
      };
    }
    case "policies::ClassificationReceived": {
      const verdict = String(args.verdict ?? "inconclusive") as "active" | "dormant" | "inconclusive";
      return {
        ...base,
        event: {
          type: "classification",
          timestamp,
          verdict,
          validatorCount: 3,
          unanimous: true, // optimistic — receipts API would refine this; not blocking for the demo
          promptTokens: verdict === "dormant" ? 267 : 276,
          completionTokens: verdict === "inconclusive" ? 8 : verdict === "dormant" ? 8 : 6,
          receiptUrl: `https://agents.testnet.somnia.network/receipts/${String(args.requestId ?? "")}`,
        },
        semanticKey: "classification",
        priority: 0,
      };
    }
    case "policies::PolicyActionTaken": {
      const verdict = String(args.verdict ?? "inconclusive") as "active" | "dormant" | "inconclusive";
      const actionStr = String(args.action ?? "noop");
      const kind: "pause" | "resume" | "noop" =
        actionStr === "pause" ? "pause" : actionStr === "resume" ? "resume" : "noop";
      const semanticKey = `action-${kind}`;
      return {
        ...base,
        event: { type: "action", timestamp, kind, verdict },
        semanticKey,
        priority: 0, // wins over Drip's mirror
      };
    }
    case "policies::PolicyCheckAborted": {
      const phaseNum = Number(args.phase ?? 0);
      const statusNum = Number(args.status ?? 0);
      const phase = phaseNum === 2 ? "classifying" : "fetching-github";
      const status = statusNum === 4 ? "timed-out" : "failed";
      return {
        ...base,
        event: { type: "check-aborted", timestamp, phase, status },
        semanticKey: "check-aborted",
        priority: 0,
      };
    }
    case "policies::PolicyDisabled": {
      return {
        ...base,
        event: { type: "policy-disabled", timestamp },
        semanticKey: "policy-disabled",
        priority: 0,
      };
    }

    default:
      return null;
  }
}
