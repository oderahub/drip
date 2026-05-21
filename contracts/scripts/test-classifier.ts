/**
 * test-classifier.ts
 *
 * Drip classifier determinism harness — Milestone 3 Step 1 (full suite).
 *
 * Runs all 6 documented test cases × case-specific repetition counts:
 *   - 3 runs each: high activity, no activity (unambiguous)
 *   - 5 runs each: commit threshold, just below, minimal, PR-only (boundary)
 *
 * After each invocation, pulls per-validator receipt data from
 *   https://receipts.testnet.agents.somnia.host/agent-receipts
 * to capture llmUsage (prompt/completion tokens) and confirm the three
 * validator-returned `result` bytes agree.
 *
 * Stop-on-failure: if any case has a run that's not Success-with-expected-
 * verdict, the rest of that case finishes (for evidence), then the suite
 * aborts before starting the next case.
 *
 * Output: contracts/test-results/classifier-determinism-{timestamp}.md
 *
 * Usage:
 *   npx hardhat run scripts/test-classifier.ts --network somniaTestnet
 *
 * Cost: up to 26 × 0.24 STT = 6.24 STT (less if a case aborts early).
 */

import hre from "hardhat";
import {
  parseEther,
  formatEther,
  decodeAbiParameters,
  type Address,
} from "viem";
import * as fs from "fs";
import * as path from "path";

const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const DEPOSIT_STT = parseEther("0.24");
const RECEIPT_BASE_UI = "https://agents.testnet.somnia.network/receipts";
const RECEIPTS_SERVICE = "https://receipts.testnet.agents.somnia.host";
const FIXED_LAST_COMMIT = 1716000000;

type Verdict = "active" | "dormant" | "inconclusive";

interface TestCase {
  name: string;
  commitCount: number;
  prCount: number;
  expected: Verdict;
  runs: number;
}

const TEST_CASES: TestCase[] = [
  { name: "high activity",    commitCount: 5, prCount: 2, expected: "active",       runs: 3 },
  { name: "no activity",      commitCount: 0, prCount: 0, expected: "dormant",      runs: 3 },
  { name: "commit threshold", commitCount: 3, prCount: 0, expected: "active",       runs: 5 },
  { name: "just below",       commitCount: 2, prCount: 0, expected: "inconclusive", runs: 5 },
  { name: "minimal",          commitCount: 1, prCount: 0, expected: "inconclusive", runs: 5 },
  { name: "PR-only",          commitCount: 0, prCount: 1, expected: "active",       runs: 5 },
];

interface ValidatorReceipt {
  decodedVerdict: string;
  status: string;            // "success" / "agent_error" / ...
  promptTokens: number;
  completionTokens: number;
  llmRequests: number;
  elapsedMs: number;
}

interface RunResult {
  caseName: string;
  runIndex: number;
  requestId: bigint;
  txHash: `0x${string}`;
  verdict: string;
  status: number;
  receiptUrl: string;
  durationMs: number;
  validatorReceipts: ValidatorReceipt[];
  validatorUnanimous: boolean | null; // null if receipts not yet fetched
}

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const statusName = (s: number) =>
  (["None", "Pending", "Success", "Failed", "TimedOut"][s] ?? `Unknown(${s})`);

async function fetchValidatorReceipts(requestId: bigint): Promise<ValidatorReceipt[]> {
  const url = `${RECEIPTS_SERVICE}/agent-receipts?requestId=${requestId}&contractAddress=${PLATFORM_TESTNET}&type=minimal`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = (await r.json()) as any;
  const list = (j.receipts ?? []) as any[];
  return list.map((rec) => {
    const ag = rec.agentReceipt ?? {};
    const llm = ag.llmUsage ?? {};
    let decodedVerdict = "";
    try {
      if (ag.result && typeof ag.result === "string" && ag.result.startsWith("0x")) {
        const [s] = decodeAbiParameters([{ type: "string" }], ag.result as `0x${string}`);
        decodedVerdict = s as string;
      }
    } catch {
      // leave empty
    }
    return {
      decodedVerdict,
      status: String(rec.status ?? "unknown"),
      promptTokens: Number(llm.promptTokens ?? 0),
      completionTokens: Number(llm.completionTokens ?? 0),
      llmRequests: Number(llm.requests ?? 0),
      elapsedMs: Number(rec.elapsedMs ?? 0),
    };
  });
}

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [caller] = await hre.viem.getWalletClients();

  const balance = await publicClient.getBalance({ address: caller.account.address });
  const totalInvocations = TEST_CASES.reduce((a, c) => a + c.runs, 0);
  const totalCost = DEPOSIT_STT * BigInt(totalInvocations);

  console.log("─────────────────────────────────────────────────────────");
  console.log(" Classifier determinism — full 26-invocation suite");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Network:           ${hre.network.name}`);
  console.log(` Caller:            ${caller.account.address}`);
  console.log(` Balance:           ${formatEther(balance)} STT`);
  console.log(` Total invocations: ${totalInvocations}`);
  console.log(` Cost ceiling:      ${formatEther(totalCost)} STT (less if a case aborts)`);
  console.log("");

  if (balance < totalCost + parseEther("1")) {
    throw new Error(`Caller balance too low: have ${formatEther(balance)}, need at least ${formatEther(totalCost + parseEther("1"))}`);
  }

  console.log(" Deploying ClassifierTester...");
  const tester = await hre.viem.deployContract("ClassifierTester", [PLATFORM_TESTNET]);
  console.log(` ClassifierTester:  ${tester.address}`);
  console.log("");

  const results: RunResult[] = [];
  const balanceBefore = await publicClient.getBalance({ address: caller.account.address });
  let abortedAtCase: string | null = null;

  for (const tc of TEST_CASES) {
    console.log("─────────────────────────────────────────────────────────");
    console.log(` Case: ${tc.name}  (c=${tc.commitCount}, p=${tc.prCount}, expected="${tc.expected}", runs=${tc.runs})`);
    console.log("─────────────────────────────────────────────────────────");
    const activityJson = buildActivityJson(tc);
    const caseRuns: RunResult[] = [];

    for (let i = 1; i <= tc.runs; i++) {
      const start = Date.now();
      const hash = await tester.write.classify([activityJson], { value: DEPOSIT_STT });
      await publicClient.waitForTransactionReceipt({ hash });
      const requestId = await tester.read.lastRequestId();

      // Poll for callback (max 120s)
      let verdict = "";
      let status = 0;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 120_000) {
        const r = (await tester.read.results([requestId])) as unknown as readonly [string, number, boolean];
        if (r[2]) { verdict = r[0]; status = r[1]; break; }
        await sleep(2000);
      }
      const durationMs = Date.now() - start;
      const receiptUrl = `${RECEIPT_BASE_UI}/${requestId.toString()}`;

      // Pull validator receipts (best-effort)
      const validatorReceipts = await fetchValidatorReceipts(requestId);
      const verdicts = validatorReceipts.map((v) => v.decodedVerdict);
      const validatorUnanimous = verdicts.length > 0 && verdicts.every((v) => v === verdicts[0]);

      const tokensSummary = validatorReceipts.length > 0
        ? `tokens(p/c)=${validatorReceipts[0].promptTokens}/${validatorReceipts[0].completionTokens}`
        : "tokens(unfetched)";

      console.log(`   [${i}/${tc.runs}] requestId=${requestId} verdict="${verdict}" status=${statusName(status)} ${tokensSummary} val-unanimous=${validatorUnanimous} (${(durationMs/1000).toFixed(1)}s)`);

      const run: RunResult = {
        caseName: tc.name,
        runIndex: i,
        requestId,
        txHash: hash,
        verdict,
        status,
        receiptUrl,
        durationMs,
        validatorReceipts,
        validatorUnanimous,
      };
      results.push(run);
      caseRuns.push(run);
    }

    // After all runs of this case complete, check for failure conditions.
    const allSuccess = caseRuns.every((r) => r.status === 2);
    const allExpected = allSuccess && caseRuns.every((r) => r.verdict === tc.expected);
    const intraAgreement = allSuccess && caseRuns.every((r) => r.verdict === caseRuns[0].verdict);
    const validatorAllAgreed = caseRuns.every((r) => r.validatorUnanimous !== false);

    console.log("");
    console.log(`   Case summary: allSuccess=${allSuccess} allExpected=${allExpected} intraAgreement=${intraAgreement} validatorAllAgreed=${validatorAllAgreed}`);
    console.log("");

    if (!allSuccess || !allExpected || !intraAgreement || !validatorAllAgreed) {
      abortedAtCase = tc.name;
      console.log(`   ABORT: case "${tc.name}" failed. Skipping remaining cases per stop-on-fail rule.`);
      console.log("");
      break;
    }
  }

  const balanceAfter = await publicClient.getBalance({ address: caller.account.address });
  const sttSpent = balanceBefore - balanceAfter;

  const byCase = new Map<string, RunResult[]>();
  for (const r of results) {
    if (!byCase.has(r.caseName)) byCase.set(r.caseName, []);
    byCase.get(r.caseName)!.push(r);
  }

  // Write report
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(__dirname, "..", "test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `classifier-determinism-${timestamp}.md`);
  fs.writeFileSync(outPath, renderReport({
    timestamp, network: hre.network.name, caller: caller.account.address,
    testerAddress: tester.address, results, byCase, sttSpent, abortedAtCase,
  }));

  console.log("─────────────────────────────────────────────────────────");
  console.log(` Report written: ${outPath}`);
  console.log(` Total STT spent: ${formatEther(sttSpent)} STT`);
  if (abortedAtCase) {
    console.log(` Suite ABORTED at case "${abortedAtCase}".`);
    process.exit(2);
  }
  console.log(" Suite passed.");
}

function renderReport(args: {
  timestamp: string;
  network: string;
  caller: Address;
  testerAddress: Address;
  results: RunResult[];
  byCase: Map<string, RunResult[]>;
  sttSpent: bigint;
  abortedAtCase: string | null;
}): string {
  const L: string[] = [];
  const avg = (xs: number[]) => xs.length === 0 ? 0 : xs.reduce((a,b)=>a+b,0)/xs.length;
  const fmt = (n: number) => Number.isInteger(n) ? n.toString() : n.toFixed(1);

  L.push(`# Drip classifier determinism test`);
  L.push("");
  L.push(`- **Date (UTC)**: ${args.timestamp}`);
  L.push(`- **Network**: Somnia testnet (chainId 50312)`);
  L.push(`- **Caller**: ${args.caller}`);
  L.push(`- **ClassifierTester**: ${args.testerAddress}`);
  L.push(`- **LLM agent**: 12847293847561029384 (Qwen3-30B, deterministic, manifest 5a2c2130…)`);
  L.push(`- **Subcommittee**: 3 (majority consensus, threshold 2)`);
  L.push(`- **Prompt source**: \`skills/skill-streaming.md\` — split into system + prompt fields, chainOfThought=false`);
  L.push(`- **Total STT spent**: ${formatEther(args.sttSpent)} STT`);
  if (args.abortedAtCase) {
    L.push(`- **Suite status**: ABORTED at case "${args.abortedAtCase}" — see per-case summary below`);
  }
  L.push("");

  L.push(`## Summary`);
  L.push("");
  L.push(`| Case | c | p | Runs | Expected | Verdicts observed | Intra-case agreement | Cross-validator agreement | Avg prompt / completion tokens | Pass |`);
  L.push(`|---|---:|---:|---:|---|---|---|---|---|---|`);
  for (const tc of TEST_CASES) {
    const rs = args.byCase.get(tc.name) ?? [];
    if (rs.length === 0) {
      L.push(`| ${tc.name} | ${tc.commitCount} | ${tc.prCount} | ${tc.runs} | ${tc.expected} | — | — | — | — | (not run) |`);
      continue;
    }
    const verdicts = rs.map((r) => r.verdict);
    const allSuccess = rs.every((r) => r.status === 2);
    const intraOk = allSuccess && verdicts.every((v) => v === verdicts[0]);
    const matchExpected = allSuccess && verdicts.every((v) => v === tc.expected);
    const validatorOk = rs.every((r) => r.validatorUnanimous !== false);
    const allTokens = rs.flatMap((r) => r.validatorReceipts.map((vr) => ({p: vr.promptTokens, c: vr.completionTokens})));
    const avgP = avg(allTokens.map(t => t.p));
    const avgC = avg(allTokens.map(t => t.c));
    L.push(`| ${tc.name} | ${tc.commitCount} | ${tc.prCount} | ${tc.runs} | ${tc.expected} | ${verdicts.map(v => `\`${v || "—"}\``).join(", ")} | ${intraOk ? "YES" : "NO"} | ${validatorOk ? "YES (3/3)" : "NO"} | ${fmt(avgP)} / ${fmt(avgC)} | ${matchExpected && intraOk && validatorOk ? "PASS" : "FAIL"} |`);
  }
  L.push("");

  L.push(`## Per-invocation detail`);
  for (const tc of TEST_CASES) {
    const rs = args.byCase.get(tc.name) ?? [];
    if (rs.length === 0) continue;
    L.push("");
    L.push(`### ${tc.name} (c=${tc.commitCount}, p=${tc.prCount}) — expected \`${tc.expected}\``);
    L.push("");
    L.push(`| Run | RequestId | Verdict | Status | Latency | Validator tokens (p/c, all 3) | Validator agreement | Receipt |`);
    L.push(`|---:|---|---|---|---|---|---|---|`);
    for (const r of rs) {
      const vrs = r.validatorReceipts;
      const tokensStr = vrs.length > 0
        ? vrs.map(v => `${v.promptTokens}/${v.completionTokens}`).join("  ·  ")
        : "(unfetched)";
      L.push(`| ${r.runIndex} | \`${r.requestId}\` | \`${r.verdict || "—"}\` | ${statusName(r.status)} | ${(r.durationMs/1000).toFixed(1)}s | ${tokensStr} | ${r.validatorUnanimous === null ? "—" : r.validatorUnanimous ? "YES" : "NO"} | [link](${r.receiptUrl}) |`);
    }
  }
  L.push("");

  // Just-below cross-validator deep dive — the canonical borderline check
  L.push(`## Cross-validator agreement — just-below case (borderline)`);
  L.push("");
  const jb = args.byCase.get("just below") ?? [];
  if (jb.length === 0) {
    L.push(`Case did not run.`);
  } else {
    const r = jb[0];
    L.push(`Inspecting **run 1** of the just-below case: requestId \`${r.requestId}\` (receipt: ${r.receiptUrl}).`);
    L.push("");
    L.push(`| Validator # | Decoded verdict | Status | Prompt tokens | Completion tokens | LLM requests | Elapsed (ms) |`);
    L.push(`|---:|---|---|---:|---:|---:|---:|`);
    r.validatorReceipts.forEach((vr, i) => {
      L.push(`| ${i+1} | \`${vr.decodedVerdict}\` | ${vr.status} | ${vr.promptTokens} | ${vr.completionTokens} | ${vr.llmRequests} | ${vr.elapsedMs} |`);
    });
    L.push("");
    L.push(`Unanimous on decoded verdict bytes: **${r.validatorUnanimous ? "YES" : "NO"}**`);
    L.push("");
    L.push(`The borderline-case check matters because a 2 vs 3 commit count tests the LLM's arithmetic precision at the boundary. Three validators independently running Qwen3-30B with chainOfThought=false should produce byte-identical outputs; this case is where that property is most fragile.`);
  }
  L.push("");

  L.push(`## Verdict`);
  L.push("");
  if (args.abortedAtCase) {
    L.push(`**DO NOT PROCEED.** Suite aborted at case "${args.abortedAtCase}". Tune the prompt before relying on the classifier in DripPolicies.`);
  } else {
    L.push(`**PROCEED to Milestone 3 Step 2.** All cases finalised Success, all runs matched expected verdicts, intra-case agreement held across all runs, and cross-validator agreement (3/3 on identical result bytes) held on every invocation including the borderline just-below case.`);
  }
  return L.join("\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
