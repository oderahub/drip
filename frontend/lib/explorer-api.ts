/**
 * Blockscout v2 logs client.
 *
 * Used for historical event backfill because Somnia's JSON-RPC caps
 * `eth_getLogs` at 1000 blocks per call. For a stream created hours
 * or days ago, that would require thousands of chunked RPC calls.
 * Blockscout's REST API has no such cap — one paginated query returns
 * the contract's full log history.
 *
 * The live-event subscription path still uses viem's
 * `watchContractEvent` (over the wagmi-configured transport) and the
 * 5-second `getLogs` safety-net poll. This module is only for the
 * "fill the screen on first paint" backfill.
 */

import type { Address } from "viem";

const TESTNET_BASE = "https://shannon-explorer.somnia.network";
const MAINNET_BASE = "https://explorer.somnia.network";

interface BlockscoutLog {
  block_number: number;
  block_hash: `0x${string}`;
  transaction_hash: `0x${string}`;
  index: number; // log index within the block
  address: { hash: `0x${string}` };
  topics: (`0x${string}` | null)[];
  data: `0x${string}`;
}

interface BlockscoutLogsResponse {
  items: BlockscoutLog[];
  next_page_params: Record<string, string | number> | null;
}

/** Raw log shape we hand back to the caller — close to viem's Log. */
export interface RawLog {
  blockNumber: bigint;
  blockHash: `0x${string}`;
  logIndex: number;
  transactionHash: `0x${string}`;
  address: `0x${string}`;
  topics: readonly (`0x${string}` | null)[];
  data: `0x${string}`;
}

export interface FetchAllLogsOpts {
  chainId: number;
  address: Address;
  /** Stop paging when this many records have been collected. */
  maxRecords?: number;
  /** Stop paging when we've fetched this many pages (safety bound). */
  maxPages?: number;
}

function baseUrl(chainId: number): string {
  return chainId === 5031 ? MAINNET_BASE : TESTNET_BASE;
}

/**
 * Fetch all logs from a contract, walking Blockscout's `next_page_params`
 * pagination until exhausted or the bounds are hit. Returns logs in
 * Blockscout's order (typically newest-first; the caller should sort).
 */
export async function fetchAllLogs(opts: FetchAllLogsOpts): Promise<RawLog[]> {
  const { chainId, address, maxRecords = 2000, maxPages = 40 } = opts;
  const base = baseUrl(chainId);
  const out: RawLog[] = [];
  let next: Record<string, string | number> | null = null;
  let page = 0;

  while (page < maxPages && out.length < maxRecords) {
    const params = new URLSearchParams();
    if (next) {
      for (const [k, v] of Object.entries(next)) params.set(k, String(v));
    }
    const url = `${base}/api/v2/addresses/${address}/logs${params.size ? `?${params}` : ""}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch {
      break;
    }
    if (!res.ok) break;
    const body = (await res.json()) as BlockscoutLogsResponse;
    for (const it of body.items ?? []) {
      out.push({
        blockNumber: BigInt(it.block_number),
        blockHash: it.block_hash,
        logIndex: it.index,
        transactionHash: it.transaction_hash,
        address: it.address.hash,
        topics: it.topics,
        data: it.data,
      });
    }
    if (!body.next_page_params) break;
    next = body.next_page_params;
    page++;
  }
  return out;
}

/**
 * Filter raw logs to those whose first indexed topic equals a given
 * uint256. Used to scope the contract-wide log dump down to a single
 * stream's events. Both Drip and DripPolicies emit streamId as the
 * first indexed argument of every stream-keyed event.
 */
export function filterByStreamId(logs: RawLog[], streamId: bigint): RawLog[] {
  const target = `0x${streamId.toString(16).padStart(64, "0")}`.toLowerCase();
  return logs.filter((l) => (l.topics?.[1] ?? "").toLowerCase() === target);
}
