/**
 * test-aggregator.ts — Milestone 4 Step B
 *
 * Validates that JsonApiAgent.fetchString(url, "") returns the entire
 * response body, against the live deployed aggregator. If it does, our
 * DripPolicies design (which assumes empty-selector returns the whole
 * JSON body) is correct. If it doesn't, we adjust before continuing.
 *
 * Cost: 0.12 STT (JSON API floor + per-agent reward × 3).
 */

import hre from "hardhat";
import { parseEther, formatEther } from "viem";

const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const DEPOSIT = parseEther("0.12");
const RECEIPT_BASE = "https://agents.testnet.somnia.network/receipts";

const AGGREGATOR_BASE = "https://drip-frontend-psi.vercel.app";
const QUERY = "username=ijjk&repo=vercel/next.js&windowDays=90";
const URL_TO_FETCH = `${AGGREGATOR_BASE}/api/github-activity?${QUERY}`;
// Selector under test. Override with PROBE_SELECTOR env var.
// First run used "". Now testing "username" to validate field selectors.
const SELECTOR = process.env.PROBE_SELECTOR ?? "username";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const statusName = (s: number) =>
  ["None", "Pending", "Success", "Failed", "TimedOut"][s] ?? `Unknown(${s})`;

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [caller] = await hre.viem.getWalletClients();
  const balance = await publicClient.getBalance({ address: caller.account.address });

  console.log("─────────────────────────────────────────────────────────");
  console.log(" M4 Step B — aggregator fetchString smoketest");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Caller:    ${caller.account.address}`);
  console.log(` Balance:   ${formatEther(balance)} STT`);
  console.log(` URL:       ${URL_TO_FETCH}`);
  console.log(` Selector:  "${SELECTOR}"  (the assumption under test)`);
  console.log(` Deposit:   ${formatEther(DEPOSIT)} STT`);
  console.log("");

  // (a) Off-chain reference: what does the aggregator return RIGHT NOW?
  console.log(" Fetching aggregator off-chain for comparison...");
  const offchain = await (await fetch(URL_TO_FETCH)).text();
  console.log(` Off-chain body (${offchain.length} bytes):`);
  console.log(`   ${offchain}`);
  console.log("");

  // (b) Deploy AggregatorSmoketest.
  console.log(" Deploying AggregatorSmoketest...");
  const tester = await hre.viem.deployContract("AggregatorSmoketest", [PLATFORM_TESTNET]);
  console.log(` Tester:    ${tester.address}`);
  console.log("");

  // (c) Issue the on-chain probe.
  console.log(" Calling probe(url, \"\")...");
  const t0 = Date.now();
  const hash = await tester.write.probe([URL_TO_FETCH, SELECTOR], { value: DEPOSIT });
  console.log(` Tx:        ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  const requestId = await tester.read.lastRequestId();
  const receiptUrl = `${RECEIPT_BASE}/${requestId.toString()}`;
  console.log(` Request:   ${requestId}`);
  console.log(` Receipt:   ${receiptUrl}`);
  console.log("");

  // (d) Poll for callback (max 60s).
  console.log(" Polling for callback (max 60s)...");
  let finalised = false;
  let status = 0;
  let body = "";
  for (;;) {
    status = Number(await tester.read.lastStatus());
    body = (await tester.read.lastBody()) as string;
    if (body.length > 0 || status >= 3) { finalised = true; break; }
    if (Date.now() - t0 > 60_000) break;
    await sleep(2000);
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("");
  console.log("─────────────────────────────────────────────────────────");
  console.log(" Result");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Finalised: ${finalised}`);
  console.log(` Status:    ${statusName(status)} (${status})`);
  console.log(` Elapsed:   ${elapsedSec}s`);
  console.log(` On-chain body (${body.length} bytes):`);
  console.log(`   ${body || "(empty)"}`);
  console.log("");

  // (e) Verdict.
  const isJson = (() => { try { JSON.parse(body); return true; } catch { return false; } })();
  const isExactMatch = body === offchain;

  console.log(" Verdict checklist:");
  console.log(`   ${status === 2 ? "PASS" : "FAIL"}  callback returned Success`);
  console.log(`   ${body.length > 0 ? "PASS" : "FAIL"}  body is non-empty`);
  console.log(`   ${isJson ? "PASS" : "FAIL"}  body parses as valid JSON`);
  console.log(`   ${isExactMatch ? "PASS" : "INFO"}  body exactly matches off-chain fetch (may legitimately differ — aggregator hits live GitHub, so timestamp/count could tick)`);
  console.log("");

  console.log(" (Acceptance criteria depend on which selector you're testing.)");
}

main().catch((e) => { console.error(e); process.exit(1); });
