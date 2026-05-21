/**
 * Drip deploy script.
 *
 * Deploys Drip and DripPolicies, funds Drip with 35 STT (to satisfy the
 * 32 STT subscription owner minimum + buffer), wires the policy contract,
 * and logs all addresses.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network somniaTestnet
 *
 * Required environment variables (from contracts/.env):
 *   PRIVATE_KEY  — deployer key with at least 50 STT
 */

import hre from "hardhat";
import { parseEther, formatEther } from "viem";

const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const PLATFORM_MAINNET = "0x5E5205CF39E766118C01636bED000A54D93163E6";

const DRIP_INITIAL_FUNDING = parseEther("35");

async function main() {
  const networkName = hre.network.name;
  const platformAddress =
    networkName === "somniaMainnet" ? PLATFORM_MAINNET : PLATFORM_TESTNET;

  console.log("─────────────────────────────────────────────────────────");
  console.log(" Deploying Drip");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Network:           ${networkName}`);
  console.log(` Platform:          ${platformAddress}`);
  console.log(` Drip initial fund: ${formatEther(DRIP_INITIAL_FUNDING)} STT`);
  console.log("");

  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();

  const deployerBalance = await publicClient.getBalance({
    address: deployer.account.address,
  });

  console.log(` Deployer:          ${deployer.account.address}`);
  console.log(` Deployer balance:  ${formatEther(deployerBalance)} STT`);
  console.log("");

  if (deployerBalance < DRIP_INITIAL_FUNDING + parseEther("5")) {
    throw new Error(
      `Deployer balance too low. Need at least ${formatEther(
        DRIP_INITIAL_FUNDING + parseEther("5")
      )} STT, have ${formatEther(deployerBalance)} STT.`
    );
  }

  // 1. Deploy Drip with 35 STT funding (constructor accepts msg.value)
  console.log(" Deploying Drip contract...");
  const drip = await hre.viem.deployContract("Drip", [], {
    value: DRIP_INITIAL_FUNDING,
  });
  console.log(` Drip:              ${drip.address}`);
  console.log("");

  // 2. Deploy DripPolicies (no funding needed at construction)
  console.log(" Deploying DripPolicies contract...");
  const dripPolicies = await hre.viem.deployContract("DripPolicies", [
    drip.address,
    platformAddress,
  ]);
  console.log(` DripPolicies:      ${dripPolicies.address}`);
  console.log("");

  // 3. Wire Drip → DripPolicies
  console.log(" Wiring Drip → DripPolicies...");
  await drip.write.setPolicies([dripPolicies.address]);
  console.log(" Wired.");
  console.log("");

  // 4. Verify final state
  const dripBalance = await publicClient.getBalance({ address: drip.address });
  const policiesAddress = await drip.read.policies();

  console.log("─────────────────────────────────────────────────────────");
  console.log(" Deployment complete");
  console.log("─────────────────────────────────────────────────────────");
  console.log(` Drip:              ${drip.address}`);
  console.log(`   balance:         ${formatEther(dripBalance)} STT`);
  console.log(`   policies:        ${policiesAddress}`);
  console.log(` DripPolicies:      ${dripPolicies.address}`);
  console.log("");
  console.log(" Next steps:");
  console.log("   1. Save the addresses above into frontend/.env.local");
  console.log("   2. Run scripts/test-agent-invocation.ts to verify the");
  console.log("      agent invocation pattern works end-to-end before");
  console.log("      building any stream logic on top.");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
