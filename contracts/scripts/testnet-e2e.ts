/**
 * testnet-e2e.ts — Milestone 4 Step D
 *
 * Runs ONE complete end-to-end policy-check cycle against the live
 * deployments:
 *
 *   1. Fund DripPolicies (via registerPolicy's payable path) so it can
 *      afford the agent invocations.
 *   2. Create a real stream from deployer → deployer (a self-stream is
 *      sufficient for the chain-of-custody test; the recipient address
 *      doesn't influence the agent loop).
 *   3. Register a policy with dataUrl pointing at the deployed aggregator
 *      and dataSelector="json" (the wrapper field validated in Step B).
 *      checkIntervalSeconds = 60 so we don't wait days.
 *   4. Watch the chain:
 *      a. Wait for Schedule subscription firing (~60s wall time).
 *      b. Capture PolicyCheckDispatched (Drip), PolicyCheckStarted
 *         (DripPolicies), the JSON API requestId.
 *      c. Wait for JSON API callback → GithubDataFetched event.
 *      d. Capture the LLM Inference requestId from the resulting
 *         createRequest.
 *      e. Wait for LLM callback → ClassificationReceived event.
 *      f. Capture PolicyActionTaken (verdict + action).
 *      g. Confirm stream status reflects the action.
 *   5. Print a JSON summary for Step E's TESTNET_RUN.md.
 *
 * Test scenario chosen for a visible state change:
 *   - username = "drip-dormant-test-xyz" (a username unlikely to exist)
 *   - repo = "vercel/next.js"
 *   - windowDays = 7
 *   → aggregator returns commitCount=0, prCount=0
 *   → classifier returns "dormant"
 *   → action = pause (stream Active → Paused)
 *
 * Cost: ~0.36 STT for one cycle + 3 STT funding + 1 STT stream amount.
 */

import hre from "hardhat";
import { parseEther, formatEther, type Address } from "viem";

const DRIP_ADDR = "0x4a70d4fca6e96690c7b397ff9ec11bfacc2de253" as const;
const POLICIES_ADDR = "0xa7d5f7a0e39177feff7239da91413284ded9d931" as const;
const PLATFORM = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776" as const;
const AGGREGATOR_BASE = "https://drip-frontend-psi.vercel.app";

const STREAM_AMOUNT = parseEther("1");          // 1 STT total
const STREAM_DURATION_S = 3600n;                // 1 hour, stays active throughout test
const CHECK_INTERVAL_S = 60n;                   // 60-second policy check
const POLICY_FUNDING = parseEther("3");         // ~8 cycles' worth of agent deposits

const GH_USERNAME = "drip-dormant-test-xyz";    // unlikely-to-exist user → 0/0
const GH_REPO = "vercel/next.js";
const GH_WINDOW_DAYS = 7;

const RECEIPT_BASE_UI = "https://agents.testnet.somnia.network/receipts";
const RECEIPT_API = "https://receipts.testnet.agents.somnia.host/agent-receipts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Somnia RPC caps eth_getLogs at a 1000-block range. Helper to compute a
// safe window ending at the current head — call before each poll.
async function windowFrom(publicClient: any, lowerHint: bigint) {
  const head = await publicClient.getBlockNumber();
  const lower = head - lowerHint > 999n ? head - 999n : lowerHint;
  return { fromBlock: lower < lowerHint ? lowerHint : lower, toBlock: head };
}

interface ValidatorSummary {
  index: number;
  status: string;
  promptTokens: number;
  completionTokens: number;
  bytesIn: number;
  bytesOut: number;
  elapsedMs: number;
  decodedResult: string;
}

async function fetchValidatorSummary(requestId: bigint, decode: "string"): Promise<ValidatorSummary[]> {
  const url = `${RECEIPT_API}?requestId=${requestId}&contractAddress=${PLATFORM}&type=minimal`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = (await r.json()) as any;
  const list = (j.receipts ?? []) as any[];
  const { decodeAbiParameters } = await import("viem");
  return list.map((rec, i) => {
    const ag = rec.agentReceipt ?? {};
    const bw = ag.bandwidthUsage ?? {};
    const llm = ag.llmUsage ?? {};
    let decoded = "";
    try {
      if (ag.result?.startsWith?.("0x")) {
        const [s] = decodeAbiParameters([{ type: decode }], ag.result as `0x${string}`);
        decoded = String(s);
      }
    } catch (e) { decoded = `<decode error: ${(e as Error).message.slice(0, 80)}>`; }
    return {
      index: i + 1,
      status: String(rec.status ?? "unknown"),
      promptTokens: Number(llm.promptTokens ?? 0),
      completionTokens: Number(llm.completionTokens ?? 0),
      bytesIn: Number(bw.bytesIn ?? 0),
      bytesOut: Number(bw.bytesOut ?? 0),
      elapsedMs: Number(rec.elapsedMs ?? 0),
      decodedResult: decoded,
    };
  });
}

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();

  const drip = await hre.viem.getContractAt("Drip", DRIP_ADDR);
  const policies = await hre.viem.getContractAt("DripPolicies", POLICIES_ADDR);

  // Capture the block we start at so subsequent getEvents calls are bounded.
  const startBlock = await publicClient.getBlockNumber();
  console.log("─────────────────────────────────────────────────────────");
  console.log(" Milestone 4 Step D — end-to-end testnet run");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Network:           somniaTestnet`);
  console.log(` Caller:            ${deployer.account.address}`);
  console.log(` Drip:              ${DRIP_ADDR}`);
  console.log(` DripPolicies:      ${POLICIES_ADDR}`);
  console.log(` Aggregator:        ${AGGREGATOR_BASE}/api/github-activity`);
  console.log(` Start block:       ${startBlock}`);
  console.log("");

  const ev: Record<string, any> = { startedAt: new Date().toISOString(), startBlock: Number(startBlock) };

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 1 — create the stream
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 1: createStream (self-stream, 1 STT over 1h)");
  const createTx = await drip.write.createStream(
    [deployer.account.address, STREAM_DURATION_S],
    { value: STREAM_AMOUNT }
  );
  const createRcpt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  // Stream ID is auto-incrementing; assume this is stream 1 on a fresh deploy.
  const streamId = (await drip.read.nextStreamId()) - 1n;
  console.log(`   tx:        ${createTx}`);
  console.log(`   block:     ${createRcpt.blockNumber}`);
  console.log(`   streamId:  ${streamId}`);
  console.log(`   status:    ${["None","Active","Paused","Cancelled","Completed"][Number(await drip.read.streamStatus([streamId]))]}`);
  ev.createStream = { tx: createTx, block: Number(createRcpt.blockNumber), streamId: streamId.toString() };
  console.log("");

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 2 — registerPolicy (also funds DripPolicies via msg.value)
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 2: registerPolicy + fund DripPolicies");
  const dataUrl = `${AGGREGATOR_BASE}/api/github-activity?username=${GH_USERNAME}&repo=${GH_REPO}&windowDays=${GH_WINDOW_DAYS}`;
  console.log(`   dataUrl:   ${dataUrl}`);
  console.log(`   selector:  "json"`);
  console.log(`   interval:  ${CHECK_INTERVAL_S}s`);
  console.log(`   funding:   ${formatEther(POLICY_FUNDING)} STT`);
  const regTx = await policies.write.registerPolicy(
    [streamId, {
      githubUsername: GH_USERNAME,
      githubRepo:     GH_REPO,
      dataUrl,
      dataSelector:   "json",
      checkIntervalSeconds: CHECK_INTERVAL_S,
    }],
    { value: POLICY_FUNDING }
  );
  const regRcpt = await publicClient.waitForTransactionReceipt({ hash: regTx });
  console.log(`   tx:        ${regTx}`);
  console.log(`   block:     ${regRcpt.blockNumber}`);
  const polBalance = await publicClient.getBalance({ address: POLICIES_ADDR });
  console.log(`   policies balance after: ${formatEther(polBalance)} STT`);

  // StreamCheckScheduled is emitted in the same tx as registerPolicy
  // (registerPolicy → _scheduleNext → drip.scheduleStreamCheck). Query
  // that exact block so we don't blow the 1000-block log range cap.
  const schedEvents = await drip.getEvents.StreamCheckScheduled(
    {},
    { fromBlock: regRcpt.blockNumber, toBlock: regRcpt.blockNumber }
  );
  if (schedEvents.length === 0) throw new Error("No StreamCheckScheduled event after registerPolicy");
  const sched = schedEvents[schedEvents.length - 1];
  const scheduledMs = sched.args.scheduledTimestampMs as bigint;
  const subId = sched.args.subscriptionId as bigint;
  const nowMs = BigInt(Date.now());
  console.log(`   scheduled subId:    ${subId}`);
  console.log(`   scheduled for ms:   ${scheduledMs}  (~${Number(scheduledMs - nowMs) / 1000}s from now)`);
  ev.registerPolicy = {
    tx: regTx, block: Number(regRcpt.blockNumber), subId: subId.toString(),
    scheduledMs: scheduledMs.toString(),
    fundingStt: formatEther(POLICY_FUNDING),
  };
  console.log("");

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 3 — wait for Schedule to fire and the first agent call
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 3: waiting for Schedule firing (60s + propagation)...");
  const phase3Deadline = Date.now() + 180_000; // 3 min safety bound
  let dispatchedEvent: any = null;
  while (Date.now() < phase3Deadline) {
    const win = await windowFrom(publicClient, regRcpt.blockNumber);
    const dispatches = await drip.getEvents.PolicyCheckDispatched(
      { streamId } as any,
      win
    );
    if (dispatches.length > 0) {
      dispatchedEvent = dispatches[dispatches.length - 1];
      break;
    }
    await sleep(3000);
  }
  if (!dispatchedEvent) throw new Error("Timed out waiting for PolicyCheckDispatched");
  console.log(`   PolicyCheckDispatched: streamId=${dispatchedEvent.args.streamId} ms=${dispatchedEvent.args.scheduledTimestampMs}`);
  console.log(`   firing tx:   ${dispatchedEvent.transactionHash}`);
  console.log(`   firing block: ${dispatchedEvent.blockNumber}`);
  ev.scheduleFiring = {
    tx: dispatchedEvent.transactionHash,
    block: Number(dispatchedEvent.blockNumber),
    elapsedSinceRegisterMs: 0, // filled below
  };
  ev.scheduleFiring.elapsedSinceRegisterMs = Number(dispatchedEvent.blockNumber) > Number(regRcpt.blockNumber)
    ? (Number(dispatchedEvent.blockNumber) - Number(regRcpt.blockNumber)) * 100
    : 0;

  // The PolicyCheckStarted event (from DripPolicies) carries the JSON API requestId.
  const startedEvents = await policies.getEvents.PolicyCheckStarted(
    { streamId } as any,
    { fromBlock: dispatchedEvent.blockNumber, toBlock: dispatchedEvent.blockNumber }
  );
  if (startedEvents.length === 0) throw new Error("No PolicyCheckStarted event after dispatch");
  const started = startedEvents[startedEvents.length - 1];
  const jsonApiReqId = started.args.requestId as bigint;
  console.log(`   PolicyCheckStarted:    streamId=${started.args.streamId} requestId=${jsonApiReqId}`);
  console.log(`   JSON API receipt:      ${RECEIPT_BASE_UI}/${jsonApiReqId}`);
  ev.jsonApi = { requestId: jsonApiReqId.toString(), receiptUrl: `${RECEIPT_BASE_UI}/${jsonApiReqId}` };
  console.log("");

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 4 — wait for JSON API callback → GithubDataFetched
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 4: waiting for JSON API callback...");
  const phase4Deadline = Date.now() + 60_000;
  let githubEvent: any = null;
  while (Date.now() < phase4Deadline) {
    const win = await windowFrom(publicClient, dispatchedEvent.blockNumber);
    const gfs = await policies.getEvents.GithubDataFetched({ streamId } as any, win);
    if (gfs.length > 0) { githubEvent = gfs[gfs.length - 1]; break; }
    await sleep(2000);
  }
  if (!githubEvent) throw new Error("Timed out waiting for GithubDataFetched");
  console.log(`   GithubDataFetched: requestId=${githubEvent.args.requestId}`);
  console.log(`   activityJson:      ${githubEvent.args.activityJson}`);
  ev.githubData = {
    tx: githubEvent.transactionHash,
    block: Number(githubEvent.blockNumber),
    activityJson: githubEvent.args.activityJson,
  };
  console.log("");

  // The LLM Inference request is created in the same tx as GithubDataFetched.
  // Its requestId is the SECOND event in our DripPolicies log? Actually, the
  // request is made via platform.createRequest — the platform emits its own
  // events. We can extract the LLM Inference requestId by reading any new
  // platform request after the JSON API request finalized. The simplest is
  // to wait for ClassificationReceived (Phase 5) which carries it.

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 5 — wait for LLM Inference callback → ClassificationReceived
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 5: waiting for LLM Inference callback...");
  const phase5Deadline = Date.now() + 60_000;
  let classifiedEvent: any = null;
  while (Date.now() < phase5Deadline) {
    const win = await windowFrom(publicClient, githubEvent.blockNumber);
    const cls = await policies.getEvents.ClassificationReceived({ streamId } as any, win);
    if (cls.length > 0) { classifiedEvent = cls[cls.length - 1]; break; }
    await sleep(2000);
  }
  if (!classifiedEvent) throw new Error("Timed out waiting for ClassificationReceived");
  const llmReqId = classifiedEvent.args.requestId as bigint;
  console.log(`   ClassificationReceived: requestId=${llmReqId} verdict="${classifiedEvent.args.verdict}"`);
  console.log(`   LLM Inference receipt:  ${RECEIPT_BASE_UI}/${llmReqId}`);
  ev.classification = {
    tx: classifiedEvent.transactionHash,
    block: Number(classifiedEvent.blockNumber),
    requestId: llmReqId.toString(),
    verdict: classifiedEvent.args.verdict,
    receiptUrl: `${RECEIPT_BASE_UI}/${llmReqId}`,
  };
  console.log("");

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 6 — confirm action dispatched + stream state
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 6: confirm action dispatched");
  const actionWin = await windowFrom(publicClient, classifiedEvent.blockNumber);
  const actions = await policies.getEvents.PolicyActionTaken({ streamId } as any, actionWin);
  if (actions.length === 0) throw new Error("No PolicyActionTaken event");
  const action = actions[actions.length - 1];
  console.log(`   PolicyActionTaken: verdict="${action.args.verdict}" action="${action.args.action}"`);
  const finalStatus = Number(await drip.read.streamStatus([streamId]));
  const statusName = ["None","Active","Paused","Cancelled","Completed"][finalStatus];
  console.log(`   Stream status:     ${statusName} (${finalStatus})`);
  ev.action = { verdict: action.args.verdict, action: action.args.action, finalStreamStatus: statusName };
  console.log("");

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 7 — fetch per-validator receipt summaries
  // ─────────────────────────────────────────────────────────────────────
  console.log(" Phase 7: fetching per-validator receipts...");
  const jsonApiVs = await fetchValidatorSummary(jsonApiReqId, "string");
  const llmVs = await fetchValidatorSummary(llmReqId, "string");
  console.log(`   JSON API validators (${jsonApiVs.length}):`);
  for (const v of jsonApiVs) console.log(`     v${v.index}: status=${v.status} elapsed=${v.elapsedMs}ms bytesIn=${v.bytesIn} bytesOut=${v.bytesOut} result.len=${v.decodedResult.length}`);
  console.log(`   LLM Inference validators (${llmVs.length}):`);
  for (const v of llmVs) console.log(`     v${v.index}: status=${v.status} elapsed=${v.elapsedMs}ms promptTokens=${v.promptTokens} completionTokens=${v.completionTokens} result="${v.decodedResult}"`);
  const jsonUnanimous = jsonApiVs.every(v => v.decodedResult === jsonApiVs[0]?.decodedResult);
  const llmUnanimous  = llmVs.every(v => v.decodedResult === llmVs[0]?.decodedResult);
  console.log(`   JSON API unanimous: ${jsonUnanimous ? "YES" : "NO"}`);
  console.log(`   LLM unanimous:      ${llmUnanimous ? "YES" : "NO"}`);
  ev.validators = {
    jsonApi: { count: jsonApiVs.length, unanimous: jsonUnanimous, perValidator: jsonApiVs },
    llm:     { count: llmVs.length,    unanimous: llmUnanimous,  perValidator: llmVs },
  };
  console.log("");

  // ─────────────────────────────────────────────────────────────────────
  //  Phase 8 — write summary
  // ─────────────────────────────────────────────────────────────────────
  ev.completedAt = new Date().toISOString();
  ev.totalElapsedSec = (Date.parse(ev.completedAt) - Date.parse(ev.startedAt)) / 1000;
  ev.testScenario = {
    githubUsername: GH_USERNAME,
    githubRepo: GH_REPO,
    windowDays: GH_WINDOW_DAYS,
    expectedVerdict: "dormant",
    expectedAction: "pause",
  };

  console.log("─────────────────────────────────────────────────────────");
  console.log(" END-TO-END SUMMARY");
  console.log("─────────────────────────────────────────────────────────");
  console.log(JSON.stringify(ev, null, 2));

  const fs = await import("fs");
  const path = await import("path");
  const outDir = path.join(__dirname, "..", "test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `testnet-e2e-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outPath, JSON.stringify(ev, null, 2));
  console.log(`\n Summary written: ${outPath}`);

  // Acceptance
  const PASS = ev.action.verdict === "dormant" && ev.action.action === "pause" && finalStatus === 2;
  console.log(PASS ? " STEP D PASS — dormant → pause → stream Paused." : " STEP D FAIL — see summary above.");
  if (!PASS) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
