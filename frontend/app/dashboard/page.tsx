"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCards } from "@/components/dashboard/stat-cards";
import { StreamFilters, type StreamFilter } from "@/components/dashboard/filters";
import { StreamCard } from "@/components/stream-card";
import { StreamCardSkeleton } from "@/components/dashboard/stream-skeleton";
import {
  EmptyConnectPrompt,
  EmptyNoStreams,
} from "@/components/dashboard/empty-state";
import { useMyStreams } from "@/hooks/use-streams";
import { StreamStatus } from "@/lib/stream";

export default function DashboardPage() {
  const [filter, setFilter] = React.useState<StreamFilter>("mine");
  const { streams, mine, sent, received, isLoading, isError, isConnected, refetch } =
    useMyStreams();

  // If not connected, the "Mine" tab makes no sense — fall back to "All".
  React.useEffect(() => {
    if (!isConnected && (filter === "mine" || filter === "sent" || filter === "received")) {
      setFilter("all");
    }
  }, [isConnected, filter]);

  const visible = React.useMemo(() => {
    switch (filter) {
      case "mine":
        return mine;
      case "sent":
        return sent;
      case "received":
        return received;
      case "active":
        return (isConnected ? mine : streams).filter(
          (s) => s.status === StreamStatus.Active,
        );
      case "paused":
        return (isConnected ? mine : streams).filter(
          (s) => s.status === StreamStatus.Paused,
        );
      case "all":
      default:
        return streams;
    }
  }, [filter, streams, mine, sent, received, isConnected]);

  return (
    <div className="container py-10 sm:py-14">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Dashboard
          </p>
          <h1 className="mt-1 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {isConnected ? "Your streams" : "Live streams on testnet"}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {isConnected
              ? "Real-time balances. The agent's verdicts and pause/resume actions show inline. Tap a card to drill in."
              : "Anyone can read. Connect a wallet to filter to streams you sent or received and to create new ones."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          {isConnected && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/streams/new">
                Create
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-8">
        <StatCards streams={isConnected ? mine : streams} />
      </div>

      {/* Filters */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <StreamFilters value={filter} onChange={setFilter} isConnected={isConnected} />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {visible.length} of {streams.length}
        </span>
      </div>

      {/* Body */}
      <div className="mt-5">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StreamCardSkeleton />
            <StreamCardSkeleton />
            <StreamCardSkeleton />
          </div>
        ) : isError ? (
          <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
            Couldn’t read streams from the chain. Try refresh.
          </div>
        ) : !isConnected && filter === "mine" ? (
          <EmptyConnectPrompt />
        ) : visible.length === 0 ? (
          <EmptyNoStreams filter={filter} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Newest first */}
            {[...visible]
              .sort((a, b) => Number(b.id - a.id))
              .map((s) => (
                <StreamCard key={s.id.toString()} stream={s} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
