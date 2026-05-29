"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useReadContract, useChainId } from "wagmi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StreamHeader } from "@/components/stream-detail/header";
import { StreamFeed } from "@/components/stream-detail/feed";
import { useStreamFeed } from "@/hooks/use-stream-feed";
import { dripAbi } from "@/lib/abi/drip";
import { ADDRESSES } from "@/lib/contracts";
import {
  tupleToStream,
  type StreamTuple,
  StreamStatus,
} from "@/lib/stream";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function StreamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const chainId = useChainId();
  const dripAddr = chainId === 5031 ? ADDRESSES.mainnet.drip : ADDRESSES.testnet.drip;

  const streamId = React.useMemo(() => {
    try {
      const id = BigInt(params?.id ?? "0");
      return id > 0n ? id : null;
    } catch {
      return null;
    }
  }, [params?.id]);

  const streamQuery = useReadContract({
    address: dripAddr,
    abi: dripAbi,
    functionName: "streams",
    args: streamId ? [streamId] : undefined,
    query: { enabled: streamId !== null, refetchInterval: 6_000 },
  });

  const stream = React.useMemo(() => {
    if (!streamQuery.data || !streamId) return null;
    return tupleToStream(streamId, streamQuery.data as unknown as StreamTuple);
  }, [streamQuery.data, streamId]);

  const feed = useStreamFeed(streamId);

  // ── Invalid stream ID ────────────────────────────────────────────
  if (streamId === null) {
    return (
      <NotFound message="That stream ID isn't a positive integer." />
    );
  }

  // ── Loading the stream struct from chain ─────────────────────────
  if (streamQuery.isPending) {
    return (
      <div className="container py-10 sm:py-14">
        <Card className="flex items-center gap-3 px-6 py-12">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Reading stream from chain…</p>
        </Card>
      </div>
    );
  }

  // ── Chain returned the zero-tuple (stream doesn't exist) ─────────
  if (!stream || stream.status === StreamStatus.None) {
    return <NotFound message={`Stream #${streamId.toString()} doesn't exist on this chain.`} />;
  }

  return (
    <div className="container py-8 sm:py-12">
      <StreamHeader stream={stream} />
      <div className="mt-10">
        <StreamFeed
          events={feed.events}
          isLoadingHistory={feed.isLoadingHistory}
          isWatching={feed.isWatching}
          onRefresh={feed.refetch}
        />
      </div>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="container py-16">
      <Card className="mx-auto max-w-md px-6 py-12 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Stream not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to streams
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
