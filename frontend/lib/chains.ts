import { defineChain } from "viem";

/**
 * Somnia testnet — chain ID 50312.
 * Block explorer: Shannon (Blockscout).
 */
export const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "Somnia Test", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.infra.testnet.somnia.network"] },
    public: { http: ["https://api.infra.testnet.somnia.network"] },
  },
  blockExplorers: {
    default: {
      name: "Shannon",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

/**
 * Somnia mainnet — chain ID 5031.
 */
export const somniaMainnet = defineChain({
  id: 5031,
  name: "Somnia",
  nativeCurrency: { name: "Somnia", symbol: "SOMI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.infra.mainnet.somnia.network"] },
    public: { http: ["https://api.infra.mainnet.somnia.network"] },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://explorer.somnia.network",
    },
  },
});
