/**
 * test-classifier.ts
 *
 * Drip classifier determinism harness — Milestone 3 Step 1.
 *
 * Deploys ClassifierTester (a thin wrapper around the LLM Inference agent
 * that owns the canonical Drip classifier prompt), then invokes it for
 * the 6 documented test cases with case-specific repetition counts:
 *
 *   - 3 runs for unambiguous cases (high activity, no activity)
 *   - 5 runs for boundary cases (commit threshold, just below, minimal, PR-only)
 *
 * For each invocation, records the requestId, decoded verdict, and the
 * Somnia receipts UI URL. After all invocations finalise, also reads the
 * platform's Request struct for ONE just-below run and checks per-validator
 * response bytes for unanimous agreement (the on-chain analog of the UI's
 * "Deterministic" indicator).
 *
 * Output: contracts/test-results/classifier-determinism-{timestamp}.md
 *
 * Usage:
 *   npx hardhat run scripts/test-classifier.ts --network somniaTestnet
 *
 * Cost: 26 invocations × 0.24 STT ≈ 6.24 STT (pre-rebate).
 */

import hre from "hardhat";
import {
  parseEther,
  formatEther,
  type Address,
} from "viem";
import * as fs from "fs";
import * as path from "path";

const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const DEPOSIT_STT = parseEther("0.24"); // 0.03 floor + 0.07 × 3
const SOMNIA_RECEIPT_BASE = "https://agents.testnet.somnia.network/receipts";

// Fixed timestamp baked into all activity payloads. Using a constant (not
// Date.now()) so the JSON is byte-identical across runs of the same case,
// which is the strict premise of the determinism check.
const FIXED_LAST_COMMIT = 1716000000; // 2024-05-18 UTC, arbitrary fixed value

type Verdict = "active" | "dormant" | "inconclusive";

interface TestCase {
  name: string;
  commitCount: number;
  prCount: number;
  expected: Verdict;
  runs: number;
}

const TEST_CASES: TestCase[] = [
  { name: "high activity",     commitCount: 5, prCount: 2, expected: "active",       runs: 3 },
  { name: "no activity",       commitCount: 0, prCount: 0, expected: "dormant",      runs: 3 },
  { name: "commit threshold",  commitCount: 3, prCount: 0, expected: "active",       runs: 5 },
  { name: "just below",        commitCount: 2, prCount: 0, expected: "inconclusive", runs: 5 },
  { name: "minimal",           commitCount: 1, prCount: 0, expected: "inconclusive", runs: 5 },
  { name: "PR-only",           commitCount: 0, prCount: 1, expected: "active",       runs: 5 },
];

interface RunResult {
  caseName: string;
  runIndex: number;
  requestId: bigint;
  txHash: `0x${string}`;
  verdict: string;
  status: number; // 2 Success, 3 Failed, 4 TimedOut
  receiptUrl: string;
  durationMs: number;
}

// Minimal ABI for platform.getRequest — used after the just-below case to
// pull per-validator responses for the cross-validator agreement check.
const PLATFORM_ABI = [
  {
    type: "function",
    name: "getRequest",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "requester", type: "address" },
          { name: "callbackAddress", type: "address" },
          { name: "callbackSelector", type: "bytes4" },
          { name: "subcommittee", type: "address[]" },
          {
            name: "responses",
            type: "tuple[]",
            components: [
              { name: "validator", type: "address" },
              { name: "result", type: "bytes" },
              { name: "status", type: "uint8" },
              { name: "receipt", type: "uint256" },
              { name: "timestamp", type: "uint256" },
              { name: "executionCost", type: "uint256" },
            ],
          },
          { name: "responseCount", type: "uint256" },
          { name: "failureCount", type: "uint256" },
          { name: "threshold", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "consensusType", type: "uint8" },
          { name: "remainingBudget", type: "uint256" },
          { name: "perAgentBudget", type: "uint256" },
        ],
      },
    ],
  },
] as const;

function buildActivityJson(tc: TestCase): string {
  return JSON.stringify({
    username: "drip-test-user",
    repo: "drip-test-org/drip-test-repo",
    windowDays: 7,
    commitCount: tc.commitCount,
    prCount: tc.prCount,
    lastCommitTimestamp: tc.commitCount === 0 ? 0 : FIXED_LAST_COMMIT,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function statusName(s: number): string {
  switch (s) {
    case 0: return "None";
    case 1: return "Pending";
    case 2: return "Success";
    case 3: return "Failed";
    case 4: return "TimedOut";
    default: return `Unknown(${s})`;
  }
}

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [caller] = await hre.viem.getWalletClients();

  const balance = await publicClient.getBalance({
    address: caller.account.address,
  });

  const totalInvocations = TEST_CASES.reduce((a, c) => a + c.runs, 0);
  const totalCost = DEPOSIT_STT * BigInt(totalInvocations);

  console.log("─────────────────────────────────────────────────────────");
  console.log(" Classifier determinism test — Milestone 3 Step 1");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Network:             ${hre.network.name}`);
  console.log(` Caller:              ${caller.account.address}`);
  console.log(` Caller balance:      ${formatEther(balance)} STT`);
  console.log(` Test cases:          ${TEST_CASES.length}`);
  console.log(` Total invocations:   ${totalInvocations}`);
  console.log(` Cost per invocation: ${formatEther(DEPOSIT_STT)} STT`);
  console.log(` Total cost (max):    ${formatEther(totalCost)} STT`);
  console.log("");

  if (balance < totalCost + parseEther("1")) {
    throw new Error(
      `Caller balance too low. Need at least ${formatEther(
        totalCost + parseEther("1")
      )} STT, have ${formatEther(balance)} STT.`
    );
  }

  // Deploy ClassifierTester
  console.log(" Deploying ClassifierTester...");
  const tester = await hre.viem.deployContract("ClassifierTester", [
    PLATFORM_TESTNET,
  ]);
  console.log(` ClassifierTester:    ${tester.address}`);
  console.log("");

  const results: RunResult[] = [];
  const balanceBefore = await publicClient.getBalance({ address: caller.account.address });

  for (const tc of TEST_CASES) {
    console.log(`─────────────────────────────────────────────────────────`);
    console.log(` Case: ${tc.name}  (c=${tc.commitCount}, p=${tc.prCount}, expected="${tc.expected}", runs=${tc.runs})`);
    console.log(`─────────────────────────────────────────────────────────`);
    const activityJson = buildActivityJson(tc);

    for (let i = 1; i <= tc.runs; i++) {
      const start = Date.now();
      const hash = await tester.write.classify([activityJson], {
        value: DEPOSIT_STT,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const requestId = await tester.read.lastRequestId();

      // Poll for callback (up to 120s)
      let verdict = "";
      let status = 0;
      const timeoutMs = 120_000;
      const pollStart = Date.now();
      while (Date.now() - pollStart < timeoutMs) {
        const r = (await tester.read.results([requestId])) as unknown as readonly [
          string, number, boolean
        ];
        if (r[2]) {
          verdict = r[0];
          status = r[1];
          break;
        }
        await sleep(2000);
      }
      const durationMs = Date.now() - start;
      const receiptUrl = `${SOMNIA_RECEIPT_BASE}/${requestId.toString()}`;

      if (status === 0 && verdict === "") {
        console.log(`   [${i}/${tc.runs}] requestId=${requestId} TIMED OUT after ${durationMs}ms — receipt: ${receiptUrl}`);
      } else {
        console.log(
          `   [${i}/${tc.runs}] requestId=${requestId} verdict="${verdict}" status=${statusName(status)} (${(durationMs/1000).toFixed(1)}s)`
        );
      }

      results.push({
        caseName: tc.name,
        runIndex: i,
        requestId,
        txHash: hash,
        verdict,
        status,
        receiptUrl,
        durationMs,
      });
    }
    console.log("");
  }

  // Post-run: cross-validator agreement check on one just-below run
  console.log("─────────────────────────────────────────────────────────");
  console.log(" Cross-validator agreement check (just below)");
  console.log("─────────────────────────────────────────────────────────");
  const justBelowResults = results.filter((r) => r.caseName === "just below");
  let validatorAgreement: {
    requestId: bigint;
    receiptUrl: string;
    responses: { validator: Address; verdict: string; status: number }[];
    unanimous: boolean;
    statusOk: boolean;
  } | null = null;

  if (justBelowResults.length > 0) {
    const target = justBelowResults[0];
    console.log(` Inspecting requestId=${target.requestId} (${target.receiptUrl})`);
    try {
      const req = (await publicClient.readContract({
        address: PLATFORM_TESTNET,
        abi: PLATFORM_ABI,
        functionName: "getRequest",
        args: [target.requestId],
      })) as any;

      const responses = (req.responses as readonly any[]).map((r) => {
        let decodedVerdict = "";
        try {
          // result is the abi-encoded return of inferString → a single string
          const result = r.result as `0x${string}`;
          // decode using viem
          const { decodeAbiParameters } = require("viem");
          const [s] = decodeAbiParameters([{ type: "string" }], result);
          decodedVerdict = s as string;
        } catch (e) {
          decodedVerdict = `<decode-error: ${(e as Error).message}>`;
        }
        return {
          validator: r.validator as Address,
          verdict: decodedVerdict,
          status: Number(r.status),
        };
      });

      const allVerdicts = responses.map((r) => r.verdict);
      const unanimous = allVerdicts.length >= 1 && allVerdicts.every((v) => v === allVerdicts[0]);
      const statusOk = responses.every((r) => r.status === 2);
      console.log(` Per-validator responses (${responses.length}):`);
      responses.forEach((r, idx) => {
        console.log(`   ${idx+1}. ${r.validator}  status=${statusName(r.status)}  verdict="${r.verdict}"`);
      });
      console.log(` Unanimous on verdict bytes: ${unanimous ? "YES" : "NO"}`);
      console.log(` All validators Success:      ${statusOk ? "YES" : "NO"}`);

      validatorAgreement = {
        requestId: target.requestId,
        receiptUrl: target.receiptUrl,
        responses,
        unanimous,
        statusOk,
      };
    } catch (err) {
      console.log(` Could not fetch platform.getRequest: ${(err as Error).message}`);
    }
  }
  console.log("");

  const balanceAfter = await publicClient.getBalance({ address: caller.account.address });
  const sttSpent = balanceBefore - balanceAfter;

  // Analysis
  const byCase = new Map<string, RunResult[]>();
  for (const r of results) {
    if (!byCase.has(r.caseName)) byCase.set(r.caseName, []);
    byCase.get(r.caseName)!.push(r);
  }

  let allCasesMatchExpected = true;
  let allCasesIntraRunAgreement = true;

  for (const tc of TEST_CASES) {
    const rs = byCase.get(tc.name) ?? [];
    const verdicts = rs.map((r) => r.verdict);
    const allMatchExpected =
      rs.length > 0 &&
      rs.every((r) => r.status === 2) &&             // every run finalised Success
      verdicts.every((v) => v === tc.expected);      // and matched the expected verdict
    // Intra-case agreement requires every run to have ALSO succeeded — runs
    // that returned ("", Failed) trivially "agree" with each other and would
    // falsely report PASS on a uniformly-broken case. Status check guards that.
    const intraAgreement =
      rs.length > 0 &&
      rs.every((r) => r.status === 2) &&
      verdicts.every((v) => v === verdicts[0]);
    if (!allMatchExpected) allCasesMatchExpected = false;
    if (!intraAgreement) allCasesIntraRunAgreement = false;
  }

  // Write the report
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(__dirname, "..", "test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `classifier-determinism-${timestamp}.md`);

  const md = renderReport({
    timestamp,
    network: hre.network.name,
    caller: caller.account.address,
    testerAddress: tester.address,
    results,
    byCase,
    allCasesMatchExpected,
    allCasesIntraRunAgreement,
    sttSpent,
    validatorAgreement,
  });

  fs.writeFileSync(outPath, md);
  console.log(`─────────────────────────────────────────────────────────`);
  console.log(` Report written: ${outPath}`);
  console.log(` Total STT spent: ${formatEther(sttSpent)} STT`);
  console.log(` Pass: cases match expected = ${allCasesMatchExpected}`);
  console.log(` Pass: intra-case agreement = ${allCasesIntraRunAgreement}`);
  if (validatorAgreement) {
    console.log(` Pass: cross-validator unanimous on just-below = ${validatorAgreement.unanimous}`);
  }
  console.log("");

  if (!allCasesMatchExpected || !allCasesIntraRunAgreement) {
    console.error(" DETERMINISM CHECK FAILED. Do not proceed to Milestone 3 Step 2.");
    process.exit(2);
  }
  console.log(" Determinism check PASSED.");
}

function renderReport(args: {
  timestamp: string;
  network: string;
  caller: Address;
  testerAddress: Address;
  results: RunResult[];
  byCase: Map<string, RunResult[]>;
  allCasesMatchExpected: boolean;
  allCasesIntraRunAgreement: boolean;
  sttSpent: bigint;
  validatorAgreement: any;
}): string {
  const lines: string[] = [];
  lines.push(`# Drip classifier determinism test`);
  lines.push("");
  lines.push(`- **Date (UTC)**: ${args.timestamp}`);
  lines.push(`- **Network**: Somnia testnet (chainId 50312)`);
  lines.push(`- **Caller**: ${args.caller}`);
  lines.push(`- **ClassifierTester**: ${args.testerAddress}`);
  lines.push(`- **LLM agent**: 12847293847561029384 (Qwen3-30B, deterministic)`);
  lines.push(`- **Subcommittee size**: 3`);
  lines.push(`- **Prompt source**: \`skills/skill-streaming.md\` — classifier prompt (committed wording)`);
  lines.push(`- **Total STT spent (incl. unrebated)**: ${formatEther(args.sttSpent)} STT`);
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Check | Result |`);
  lines.push(`|---|---|`);
  lines.push(`| All cases match expected verdict | ${args.allCasesMatchExpected ? "PASS" : "FAIL"} |`);
  lines.push(`| All runs of each case agree (intra-case) | ${args.allCasesIntraRunAgreement ? "PASS" : "FAIL"} |`);
  if (args.validatorAgreement) {
    lines.push(`| Cross-validator unanimous on just-below | ${args.validatorAgreement.unanimous ? "PASS" : "FAIL"} |`);
  }
  lines.push("");

  lines.push(`## Per-case results`);
  lines.push("");
  lines.push(`| Case | c | p | Runs | Expected | Verdicts observed | Pass |`);
  lines.push(`|---|---:|---:|---:|---|---|---|`);
  for (const tc of TEST_CASES) {
    const rs = args.byCase.get(tc.name) ?? [];
    const verdicts = rs.map((r) => r.verdict);
    const allSuccess = rs.length > 0 && rs.every((r) => r.status === 2);
    const allMatch = allSuccess && verdicts.every((v) => v === tc.expected);
    const intraOk = allSuccess && verdicts.every((v) => v === verdicts[0]);
    const pass = allMatch && intraOk;
    lines.push(
      `| ${tc.name} | ${tc.commitCount} | ${tc.prCount} | ${tc.runs} | ${tc.expected} | ${verdicts.map((v) => `\`${v || "—"}\``).join(", ")} | ${pass ? "PASS" : "FAIL"} |`
    );
  }
  lines.push("");

  lines.push(`## Per-invocation detail`);
  for (const tc of TEST_CASES) {
    const rs = args.byCase.get(tc.name) ?? [];
    lines.push("");
    lines.push(`### ${tc.name} (c=${tc.commitCount}, p=${tc.prCount}) — expected \`${tc.expected}\``);
    lines.push("");
    lines.push(`| Run | RequestId | Verdict | Status | Tx | Receipt URL |`);
    lines.push(`|---:|---|---|---|---|---|`);
    for (const r of rs) {
      lines.push(
        `| ${r.runIndex} | \`${r.requestId.toString()}\` | \`${r.verdict || "—"}\` | ${statusName(r.status)} | [tx](https://shannon-explorer.somnia.network/tx/${r.txHash}) | [receipt](${r.receiptUrl}) |`
      );
    }
  }
  lines.push("");

  lines.push(`## Cross-validator agreement (just-below case)`);
  lines.push("");
  if (args.validatorAgreement) {
    const va = args.validatorAgreement;
    lines.push(`- **RequestId**: \`${va.requestId.toString()}\``);
    lines.push(`- **Receipt UI**: ${va.receiptUrl}`);
    lines.push(`- **Validators (${va.responses.length})**:`);
    lines.push("");
    lines.push(`| # | Validator | Status | Verdict |`);
    lines.push(`|---:|---|---|---|`);
    va.responses.forEach((r: any, idx: number) => {
      lines.push(`| ${idx+1} | \`${r.validator}\` | ${statusName(r.status)} | \`${r.verdict}\` |`);
    });
    lines.push("");
    lines.push(`- **Unanimous on verdict bytes**: ${va.unanimous ? "YES" : "NO"}`);
    lines.push(`- **All validators returned Success**: ${va.statusOk ? "YES" : "NO"}`);
    lines.push("");
    lines.push(`The on-chain check reads each validator's submitted result bytes via \`platform.getRequest(requestId)\` and decodes them as the inferred string. Unanimous bytes across all subcommittee members is the on-chain analog of the receipts-UI "Deterministic" indicator. Independently verify the indicator and per-validator details at the receipt URL above.`);
  } else {
    lines.push(`Could not fetch platform.getRequest for the just-below case.`);
  }
  lines.push("");

  lines.push(`## Verdict`);
  lines.push("");
  if (args.allCasesMatchExpected && args.allCasesIntraRunAgreement && (args.validatorAgreement?.unanimous ?? true)) {
    lines.push(`**PROCEED to Milestone 3 Step 2.** Classifier determinism holds across runs, validators, and matches the documented expected outputs in \`skills/skill-streaming.md\`.`);
  } else {
    lines.push(`**DO NOT PROCEED.** Tune the prompt before relying on the classifier in \`DripPolicies\`.`);
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
