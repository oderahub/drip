"use client";

import Link from "next/link";
import { ArrowRight, Droplets, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WalletConnectButton } from "@/components/connect-button";

export function EmptyConnectPrompt() {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Wallet className="h-5 w-5" />
      </span>
      <div className="max-w-md space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight">Connect a wallet to see your streams</h3>
        <p className="text-sm text-muted-foreground">
          Drip never asks for signatures to read. Connection is just so we can filter
          the on-chain streams to ones you sent or received.
        </p>
      </div>
      <WalletConnectButton />
    </Card>
  );
}

export function EmptyNoStreams({ filter }: { filter: string }) {
  const isMine = filter === "mine" || filter === "sent" || filter === "received";
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Droplets className="h-5 w-5" />
      </span>
      <div className="max-w-md space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight">
          {isMine ? "No streams yet" : "No streams match this filter"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isMine
            ? "Create your first stream — recipient, amount, duration. Add a policy and watch the agent decide."
            : "Switch tabs to see all visible streams on testnet."}
        </p>
      </div>
      {isMine && (
        <Button asChild className="gap-2">
          <Link href="/streams/new">
            Create a stream
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </Card>
  );
}
