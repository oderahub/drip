/**
 * Verified production deployments (May 2026).
 *
 * Both contracts source-verified on Shannon:
 *   https://shannon-explorer.somnia.network/address/0x4a70...e253#code
 *   https://shannon-explorer.somnia.network/address/0xa7d5...d931#code
 *
 * If we ever redeploy, update these and the `addresses` map in any
 * preview-deploy environment files.
 */

import type { Address } from "viem";

export const ADDRESSES = {
  testnet: {
    drip: "0x4a70d4fca6e96690c7b397ff9ec11bfacc2de253" as Address,
    dripPolicies: "0xa7d5f7a0e39177feff7239da91413284ded9d931" as Address,
    platform: "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776" as Address,
  },
  mainnet: {
    // Not yet deployed.
    drip: "0x0000000000000000000000000000000000000000" as Address,
    dripPolicies: "0x0000000000000000000000000000000000000000" as Address,
    platform: "0x5E5205CF39E766118C01636bED000A54D93163E6" as Address,
  },
} as const;

/** Deployed metadata baked into the static build for the "verified" banner. */
export const VERIFIED_RUN = {
  date: "May 21–26, 2026",
  classifierRequestId: "919585",
  classifierUrl: "https://agents.testnet.somnia.network/receipts/919585",
  promptTokens: 276,
  e2eDurationSec: 70,
  validatorConsensus: "3/3 unanimous",
} as const;
