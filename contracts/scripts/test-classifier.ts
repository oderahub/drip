/**
 * test-classifier.ts
 *
 * The single highest-risk technical test in the Drip build: verifies that
 * the GitHub-activity classifier returns deterministic results across
 * validators and across repeated runs.
 *
 * If the LLM Inference classifier flips between values on the same input,
 * the demo will eventually fail in front of judges. This script catches
 * that failure mode early.
 *
 * Test plan:
 *   1. Deploy a thin TestClassifier contract that wraps LLM Inference.
 *   2. For each canonical input case, invoke the classifier N times.
 *   3. Confirm all N runs return the same answer.
 *   4. Confirm the answer matches the documented expected output.
 *
 * Test cases (from skill-streaming.md):
 *   - {commitCount: 5, prCount: 2}   → "active"
 *   - {commitCount: 0, prCount: 1}   → "active"   (PR OR clause)
 *   - {commitCount: 3, prCount: 0}   → "active"   (commit OR clause)
 *   - {commitCount: 2, prCount: 0}   → "inconclusive"
 *   - {commitCount: 0, prCount: 0}   → "dormant"
 *   - {commitCount: 1, prCount: 0}   → "inconclusive"
 *
 * Usage:
 *   npx hardhat run scripts/test-classifier.ts --network somniaTestnet
 *
 * Cost: 0.24 STT per invocation × N runs × 6 cases. For N=3 that's ~4.5 STT.
 * For N=20 (recommended for thorough check) that's ~30 STT. Adjust N below.
 */

import hre from "hardhat";
import { parseEther, formatEther } from "viem";

const N_RUNS_PER_CASE = 3; // increase to 20 for thorough pre-demo check
const DEPOSIT_STT = parseEther("0.24"); // 0.03 floor + 0.07 × 3 reward

interface TestCase {
  name: string;
  commitCount: number;
  prCount: number;
  expected: "active" | "dormant" | "inconclusive";
}

const TEST_CASES: TestCase[] = [
  { name: "high activity",       commitCount: 5, prCount: 2, expected: "active" },
  { name: "PR-only",             commitCount: 0, prCount: 1, expected: "active" },
  { name: "commit threshold",    commitCount: 3, prCount: 0, expected: "active" },
  { name: "just below threshold", commitCount: 2, prCount: 0, expected: "inconclusive" },
  { name: "no activity",         commitCount: 0, prCount: 0, expected: "dormant" },
  { name: "minimal activity",    commitCount: 1, prCount: 0, expected: "inconclusive" },
];

const CLASSIFIER_PROMPT_TEMPLATE = `Role: You are a DAO contributor activity classifier. You make deterministic judgments about contributor engagement based on GitHub commit data.

Task: Analyze the provided GitHub activity for one contributor over the past 7 days. Determine if they are:
- "active" — committed code at least 3 times OR opened/merged at least 1 pull request
- "dormant" — zero commits AND zero pull request activity
- "inconclusive" — any state between the two thresholds

Data source: The activity payload below is fetched from GitHub's REST API by a Somnia JSON API Request agent. Fields include commit count, PR count, and most recent commit timestamp.

Output: Reply with exactly one word from the allowed set: active, dormant, inconclusive. No reasoning, no punctuation, no other words.

Activity data:
{ACTIVITY_JSON}`;

function buildPrompt(commitCount: number, prCount: number): string {
  const json = JSON.stringify({
    username: "testuser",
    repo: "testuser/test-repo",
    windowDays: 7,
    commitCount,
    prCount,
    lastCommitTimestamp: Math.floor(Date.now() / 1000),
  });
  return CLASSIFIER_PROMPT_TEMPLATE.replace("{ACTIVITY_JSON}", json);
}

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [caller] = await hre.viem.getWalletClients();

  const balance = await publicClient.getBalance({
    address: caller.account.address,
  });

  const totalCost = DEPOSIT_STT * BigInt(N_RUNS_PER_CASE * TEST_CASES.length);

  console.log("─────────────────────────────────────────────────────────");
  console.log(" Classifier determinism test");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Test cases:     ${TEST_CASES.length}`);
  console.log(` Runs per case:  ${N_RUNS_PER_CASE}`);
  console.log(` Total invocations: ${TEST_CASES.length * N_RUNS_PER_CASE}`);
  console.log(` Cost per invocation: ${formatEther(DEPOSIT_STT)} STT`);
  console.log(` Total cost estimate: ${formatEther(totalCost)} STT`);
  console.log(` Caller balance: ${formatEther(balance)} STT`);
  console.log("");

  if (balance < totalCost + parseEther("1")) {
    throw new Error(
      `Caller balance too low. Need at least ${formatEther(
        totalCost + parseEther("1")
      )} STT, have ${formatEther(balance)} STT.`
    );
  }

  console.log("  This script is a SCAFFOLD. The full implementation requires:");
  console.log("   1. A TestClassifier.sol contract that wraps LLM Inference");
  console.log("   2. Pending-request tracking with callback awaiting");
  console.log("   3. Asynchronous result collection across runs");
  console.log("");
  console.log("  Use Claude Code to build the TestClassifier contract from");
  console.log("   the IJsonApiAgent + ILLMAgent interfaces. The classifier");
  console.log("   pattern follows the BtcPriceOracle smoke test exactly, but");
  console.log("   targets LLM_INFERENCE_AGENT_ID with the inferString payload.");
  console.log("");
  console.log("  Expected outputs (verify after building):");

  for (const tc of TEST_CASES) {
    console.log(
      `    [${tc.name.padEnd(22)}] c=${tc.commitCount} p=${tc.prCount} → "${tc.expected}"`
    );
  }

  console.log("");
  console.log("  Prompt that will be sent (sample for first case):");
  console.log("");
  console.log("─────────────────────────────────────────────────────────");
  console.log(buildPrompt(TEST_CASES[0].commitCount, TEST_CASES[0].prCount));
  console.log("─────────────────────────────────────────────────────────");
  console.log("");
  console.log(" Determinism check criteria:");
  console.log("   - All N runs of the same case return the same string");
  console.log("   - That string matches the documented expected output");
  console.log("   - At least one run is verified against the receipt UI for");
  console.log("     three-validator agreement (Deterministic indicator)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
