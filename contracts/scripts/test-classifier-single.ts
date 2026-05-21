/**
 * test-classifier-single.ts
 *
 * Step C of Milestone 3 setup: ONE invocation of the classifier with the
 * high-activity case (commits=5, prs=2, expected="active"). No report
 * file, no other cases. If this passes, the full 26-invocation determinism
 * suite (test-classifier.ts) is unblocked.
 *
 * Pass criteria:
 *   - Callback fires in 8-15 seconds (sub-4s => agent rejected again, stop)
 *   - Status = Success
 *   - Verdict = "active"
 *   - Receipt UI shows non-zero Data In, Prompt Tokens, LLM Requests
 *
 * Cost: 0.24 STT.
 */

import hre from "hardhat";
import { parseEther, formatEther } from "viem";

const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const DEPOSIT_STT = parseEther("0.24");
const RECEIPT_BASE = "https://agents.testnet.somnia.network/receipts";
const FIXED_LAST_COMMIT = 1716000000;

function statusName(s: number): string {
  return ["None","Pending","Success","Failed","TimedOut"][s] ?? `Unknown(${s})`;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [caller] = await hre.viem.getWalletClients();

  const balance = await publicClient.getBalance({ address: caller.account.address });
  console.log("─────────────────────────────────────────────────────────");
  console.log(" Step C — single high-activity invocation");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Caller:    ${caller.account.address}`);
  console.log(` Balance:   ${formatEther(balance)} STT`);
  console.log(` Deposit:   ${formatEther(DEPOSIT_STT)} STT`);
  console.log("");

  console.log(" Deploying ClassifierTester...");
  const tester = await hre.viem.deployContract("ClassifierTester", [PLATFORM_TESTNET]);
  console.log(` ClassifierTester: ${tester.address}`);
  console.log("");

  // Print the exact committed wording so we can confirm what's on-chain
  // matches what we approved off-chain.
  const sys = await tester.read.systemMessage();
  const pp = await tester.read.promptPrefix();
  console.log(" On-chain SYSTEM_MESSAGE (sha-style truncation):");
  console.log("   ", JSON.stringify(sys));
  console.log(" On-chain PROMPT_PREFIX:");
  console.log("   ", JSON.stringify(pp));
  console.log("");

  const activityJson = JSON.stringify({
    username: "drip-test-user",
    repo: "drip-test-org/drip-test-repo",
    windowDays: 7,
    commitCount: 5,
    prCount: 2,
    lastCommitTimestamp: FIXED_LAST_COMMIT,
  });
  console.log(" Activity JSON (high activity case):");
  console.log("   ", activityJson);
  console.log("");

  const t0 = Date.now();
  const hash = await tester.write.classify([activityJson], { value: DEPOSIT_STT });
  console.log(` Tx hash:   ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  const requestId = await tester.read.lastRequestId();
  const receiptUrl = `${RECEIPT_BASE}/${requestId.toString()}`;
  console.log(` Request:   ${requestId} -> ${receiptUrl}`);
  console.log("");
  console.log(" Polling for callback (max 60s, 2s interval)...");

  let result: readonly [string, number, boolean] | null = null;
  for (;;) {
    const r = (await tester.read.results([requestId])) as unknown as readonly [string, number, boolean];
    if (r[2]) { result = r; break; }
    if (Date.now() - t0 > 60_000) break;
    await sleep(2000);
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  if (!result || !result[2]) {
    console.error(` Timed out after ${elapsedSec}s. Receipt: ${receiptUrl}`);
    process.exit(1);
  }

  const [verdict, status] = result;
  console.log("");
  console.log("─────────────────────────────────────────────────────────");
  console.log(" Result");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Elapsed:   ${elapsedSec}s`);
  console.log(` Status:    ${statusName(Number(status))} (${status})`);
  console.log(` Verdict:   "${verdict}"`);
  console.log(` Receipt:   ${receiptUrl}`);
  console.log("");

  const elapsed = parseFloat(elapsedSec);
  const passLatency = elapsed >= 8 && elapsed <= 15;
  const passStatus = Number(status) === 2;
  const passVerdict = verdict === "active";

  console.log(" Pass-criteria checklist:");
  console.log(`   ${passLatency ? "PASS" : "MAYBE"} latency 8-15s         (${elapsed}s)`);
  console.log(`   ${passStatus  ? "PASS" : "FAIL"} status == Success      (${statusName(Number(status))})`);
  console.log(`   ${passVerdict ? "PASS" : "FAIL"} verdict == "active"   ("${verdict}")`);
  console.log("");
  if (elapsed < 4) {
    console.log(" Sub-4s callback. The agent likely rejected the request again.");
    console.log(" STOP and inspect the receipt URL.");
    process.exit(2);
  }
  if (!passStatus) {
    console.log(" Status not Success. STOP and DM Emre with the request ID.");
    process.exit(2);
  }
  if (!passVerdict) {
    console.log(" Verdict mismatch — the LLM ran but returned an unexpected value.");
    console.log(" Investigate the prompt before running the full suite.");
    process.exit(2);
  }
  console.log(" Step C PASS. Full determinism suite is unblocked.");
}

main().catch((err) => { console.error(err); process.exit(1); });
