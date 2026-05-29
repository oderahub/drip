"use client";

import * as React from "react";
import { toast } from "sonner";
import { useWriteContract, useChainId, usePublicClient } from "wagmi";
import { maxUint256 } from "viem";
import { dripAbi } from "@/lib/abi/drip";
import { dripPoliciesAbi } from "@/lib/abi/drip-policies";
import { ADDRESSES } from "@/lib/contracts";

/**
 * The three stream actions the UI exposes:
 *
 *   - withdraw(streamId)        recipient pulls available balance
 *   - cancel(streamId)          sender ends the stream
 *   - disablePolicy(streamId)   sender stops the agent's chain
 *
 * Pause/resume are NOT exposed — those are policies-only on the
 * contract side (the agent calls them based on classifier verdicts).
 *
 * Each action toasts on submission and confirmation. Returns a stable
 * `isPending` flag for the calling component.
 */
export function useStreamActions(streamId: bigint) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const addrs = chainId === 5031 ? ADDRESSES.mainnet : ADDRESSES.testnet;
  const { writeContractAsync, isPending } = useWriteContract();
  const [confirming, setConfirming] = React.useState<null | "withdraw" | "cancel" | "disable">(null);

  const explorerTx = (hash: string) =>
    `https://shannon-explorer.somnia.network/tx/${hash}`;

  const run = React.useCallback(
    async (
      kind: "withdraw" | "cancel" | "disable",
      args: unknown[],
      address: `0x${string}`,
      abi: typeof dripAbi | typeof dripPoliciesAbi,
      functionName: string,
      successMsg: string,
    ) => {
      const submittingId = toast.loading(`Submitting ${kind}…`);
      try {
        const hash = await writeContractAsync({
          address,
          abi,
          functionName: functionName as never,
          args: args as never,
        });
        toast.dismiss(submittingId);
        toast.success("Tx submitted", {
          description: `Waiting for confirmation…`,
          action: {
            label: "View",
            onClick: () => window.open(explorerTx(hash), "_blank"),
          },
        });
        setConfirming(kind);
        try {
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash });
          }
          toast.success(successMsg, {
            action: {
              label: "View tx",
              onClick: () => window.open(explorerTx(hash), "_blank"),
            },
          });
        } finally {
          setConfirming(null);
        }
      } catch (err) {
        toast.dismiss(submittingId);
        const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        toast.error(`${kind} failed`, { description: msg });
      }
    },
    [publicClient, writeContractAsync],
  );

  return {
    isPending,
    confirming,
    withdraw: () =>
      run(
        "withdraw",
        [streamId, maxUint256],
        addrs.drip,
        dripAbi,
        "withdraw",
        "Funds transferred",
      ),
    cancel: () =>
      run(
        "cancel",
        [streamId],
        addrs.drip,
        dripAbi,
        "cancel",
        "Stream cancelled",
      ),
    disablePolicy: () =>
      run(
        "disable",
        [streamId],
        addrs.dripPolicies,
        dripPoliciesAbi,
        "disablePolicy",
        "Policy disabled — no further agent checks",
      ),
  };
}
