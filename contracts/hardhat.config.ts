import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SOMNIA_TESTNET_RPC =
  process.env.SOMNIA_TESTNET_RPC || "https://api.infra.testnet.somnia.network";
const SOMNIA_MAINNET_RPC =
  process.env.SOMNIA_MAINNET_RPC || "https://api.infra.mainnet.somnia.network";

if (!PRIVATE_KEY) {
  console.warn(
    "[hardhat.config] PRIVATE_KEY not set in .env — network deployments will fail until you set it."
  );
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    somniaTestnet: {
      url: SOMNIA_TESTNET_RPC,
      chainId: 50312,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    somniaMainnet: {
      url: SOMNIA_MAINNET_RPC,
      chainId: 5031,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;
