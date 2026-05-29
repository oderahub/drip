"use client";

import { cn } from "@/lib/utils";

export type StreamFilter = "all" | "mine" | "sent" | "received" | "active" | "paused";

const TABS: { key: StreamFilter; label: string }[] = [
  { key: "mine", label: "Mine" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "all", label: "All" },
];

const TABS_NOT_CONNECTED: { key: StreamFilter; label: string }[] = [
  { key: "all", label: "All streams" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
];

export function StreamFilters({
  value,
  onChange,
  isConnected,
}: {
  value: StreamFilter;
  onChange: (v: StreamFilter) => void;
  isConnected: boolean;
}) {
  const tabs = isConnected ? TABS : TABS_NOT_CONNECTED;
  return (
    <div className="-mx-1 flex overflow-x-auto px-1 sm:overflow-visible">
      <div className="inline-flex h-10 items-center gap-1 rounded-2xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex h-8 select-none items-center rounded-xl px-3 text-sm font-medium transition-colors",
              value === t.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
