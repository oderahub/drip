"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { ChevronDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drip-styled wallet connect — we wrap RainbowKit's `ConnectButton.Custom`
 * so the trigger matches the rest of our button system (radius, hover,
 * type scale) instead of RainbowKit's default chrome.
 *
 * Three states:
 *   - Not connected: emerald "Connect wallet" CTA
 *   - Wrong network: amber-tinted "Wrong network" CTA (triggers switch)
 *   - Connected: pill showing network + balance + address (opens modal)
 */
export function WalletConnectButton({ compact = false }: { compact?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            aria-hidden={!ready}
            className={cn(!ready && "pointer-events-none select-none opacity-0")}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    onClick={openConnectModal}
                    size={compact ? "sm" : "default"}
                    className="gap-2"
                  >
                    <Wallet className="h-4 w-4" />
                    Connect wallet
                  </Button>
                );
              }
              if (chain.unsupported) {
                return (
                  <Button
                    onClick={openChainModal}
                    variant="outline"
                    size={compact ? "sm" : "default"}
                    className="gap-2 border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
                  >
                    Wrong network
                  </Button>
                );
              }
              return (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                  >
                    {chain.hasIcon && chain.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={chain.iconUrl}
                        alt=""
                        className="h-3.5 w-3.5 rounded-full"
                      />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                    )}
                    {chain.name}
                  </button>
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                  >
                    {account.displayBalance ? (
                      <span className="font-numeric text-xs text-muted-foreground">
                        {account.displayBalance}
                      </span>
                    ) : null}
                    <span className="font-numeric text-foreground">
                      {account.displayName}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
