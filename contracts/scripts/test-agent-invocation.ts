/**
 * test-agent-invocation.ts
 *
 * The canonical "tiny end-to-end demo already working" smoke test from the
 * SomniaDevs "Building on the Agentic L1" guide. Deploys a minimal BTC price
 * oracle that uses the JSON API Request agent, invokes it, and confirms the
 * callback fires with a real price.
 *
 * This is your foundation check. Every other agent invocation in Drip follows
 * the same shape. If this works, your environment, deposit math, callback
 * gating, and receive() are all correct.
 *
 * Usage:
 *   npx hardhat run scripts/test-agent-invocation.ts --network somniaTestnet
 *
 * Expected output:
 *   - A deployed BtcPriceOracle address
 *   - A request ID printed
 *   - Within ~15 seconds, a callback log showing BTC/USD price
 *
 * If this fails, do not build anything else until it works. The most likely
 * causes are listed at the bottom of this file.
 */

import hre from "hardhat";
import { parseEther, formatEther } from "viem";

const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const DEPOSIT_STT = parseEther("0.12"); // 0.03 floor + 0.03 × 3 reward

// Minimal BtcPriceOracle source — compiled inline. In production this would
// be in its own .sol file, but for a smoke test we keep it self-contained
// and we'll deploy by referencing the BtcPriceOracle from a test contracts
// file (not yet included; this script assumes you've added one).
//
// You can either:
//   (a) Create contracts/contracts/test/BtcPriceOracle.sol from the snippet
//       in skills/skill-agents.md and uncomment the deploy below, OR
//   (b) Use the Agent Explorer at https://agents.testnet.somnia.network/ to
//       deploy the example directly and just exercise it from this script.
//
// For the scaffold, we'll print instructions and exit gracefully if the
// contract artifact isn't present.

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [caller] = await hre.viem.getWalletClients();

  console.log("─────────────────────────────────────────────────────────");
  console.log(" Smoke test: Somnia Agents — JSON API Request");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Network:    ${hre.network.name}`);
  console.log(` Platform:   ${PLATFORM_TESTNET}`);
  console.log(` Caller:     ${caller.account.address}`);

  const balance = await publicClient.getBalance({
    address: caller.account.address,
  });
  console.log(` Balance:    ${formatEther(balance)} STT`);
  console.log(` Deposit:    ${formatEther(DEPOSIT_STT)} STT (floor + 0.03 × 3)`);
  console.log("");

  if (balance < DEPOSIT_STT + parseEther("1")) {
    throw new Error("Caller balance too low. Faucet up to at least ~5 STT.");
  }

  // Check whether the BtcPriceOracle artifact exists.
  let oracle;
  try {
    oracle = await hre.viem.deployContract("BtcPriceOracle", [
      PLATFORM_TESTNET,
    ]);
  } catch (err) {
    console.error("");
    console.error("  Could not find a BtcPriceOracle contract.");
    console.error("");
    console.error("  Create contracts/contracts/test/BtcPriceOracle.sol with");
    console.error("  the snippet from skills/skill-agents.md, then re-run:");
    console.error("    npx hardhat compile");
    console.error("    npx hardhat run scripts/test-agent-invocation.ts --network somniaTestnet");
    console.error("");
    process.exit(1);
  }

  console.log(` Oracle deployed at: ${oracle.address}`);
  console.log("");
  console.log(" Calling requestBitcoinPrice...");

  const txHash = await oracle.write.requestBitcoinPrice({
    value: DEPOSIT_STT,
  });
  console.log(` Tx:         ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(` Tx mined in block ${receipt.blockNumber}`);
  console.log("");

  // Wait for the PriceReceived event. The agent callback should fire within
  // ~15 seconds. We poll the contract's latestPrice() view.
  console.log(" Polling for callback (up to 60 seconds)...");
  const startedAt = Date.now();
  const timeoutMs = 60_000;

  while (Date.now() - startedAt < timeoutMs) {
    const latestPrice = await oracle.read.latestPrice();
    if (latestPrice > 0n) {
      const usd = Number(latestPrice) / 1e8; // 8 decimals
      console.log("");
      console.log("─────────────────────────────────────────────────────────");
      console.log(" Success — callback fired");
      console.log("─────────────────────────────────────────────────────────");
      console.log(` BTC/USD price: $${usd.toFixed(2)}`);
      console.log("");
      console.log(" Smoke test passed. Your agent invocation pipeline works.");
      console.log("");
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.error("");
  console.error(" Timed out waiting for callback after 60 seconds.");
  console.error("");
  console.error(" Diagnosis steps:");
  console.error(`   - View the request receipt at https://agents.testnet.somnia.network/`);
  console.error(`     using the request ID from the tx logs.`);
  console.error("   - If the receipt shows agent_error / HTTP 400, the agent");
  console.error("     service may be having issues.");
  console.error("   - If receipt shows the request was never picked up,");
  console.error("     verify your deposit matches the formula.");
  console.error("");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
