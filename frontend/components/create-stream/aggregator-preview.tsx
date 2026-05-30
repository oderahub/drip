"use client";

import * as React from "react";
import { ExternalLink, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { buildDataUrl } from "@/lib/create-stream-schema";
import { cn } from "@/lib/utils";

export function AggregatorPreview({
  username,
  repo,
  windowDays,
}: {
  username: string;
  repo: string;
  windowDays: number;
}) {
  const ready = username && repo.includes("/") && windowDays >= 1 && windowDays <= 90;
  const dataUrl = ready ? buildDataUrl({ username, repo, windowDays }) : "";

  const [status, setStatus] = React.useState<"idle" | "loading" | "ok" | "error">("idle");
  const [body, setBody] = React.useState<string | null>(null);

  const fetchPreview = React.useCallback(async () => {
    if (!ready) return;
    setStatus("loading");
    setBody(null);
    try {
      const r = await fetch(dataUrl);
      if (!r.ok) {
        setStatus("error");
        setBody(`HTTP ${r.status}`);
        return;
      }
      const j = (await r.json()) as { json?: string; [k: string]: unknown };
      setStatus("ok");
      setBody(j.json ?? JSON.stringify(j));
    } catch (e) {
      setStatus("error");
      setBody(e instanceof Error ? e.message : "Fetch failed");
    }
  }, [dataUrl, ready]);

  // Debounced auto-preview when ready & inputs settle for a moment.
  React.useEffect(() => {
    if (!ready) {
      setStatus("idle");
      setBody(null);
      return;
    }
    const handle = window.setTimeout(() => void fetchPreview(), 500);
    return () => window.clearTimeout(handle);
  }, [ready, fetchPreview]);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What the agent will fetch
        </p>
        {ready && (
          <button
            type="button"
            onClick={fetchPreview}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </button>
        )}
      </div>

      <div className="break-all rounded-xl border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground/85">
        {ready ? (
          <>
            <a
              href={dataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-baseline gap-1 hover:underline"
            >
              {dataUrl}
              <ExternalLink className="h-2.5 w-2.5 self-center opacity-70" />
            </a>
          </>
        ) : (
          <span className="text-muted-foreground">Fill the policy inputs to see the URL the JSON API agent will hit.</span>
        )}
      </div>

      {ready && (
        <div
          className={cn(
            "rounded-xl border p-3 text-[12px]",
            status === "loading" && "border-border bg-card text-muted-foreground",
            status === "ok" && "border-success/30 bg-success/5 text-foreground",
            status === "error" && "border-warning/40 bg-warning/8 text-foreground"
          )}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
            {status === "loading" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Live response
              </>
            )}
            {status === "ok" && (
              <>
                <CheckCircle2 className="h-3 w-3 text-success" /> Agent will see (json field)
              </>
            )}
            {status === "error" && (
              <>
                <AlertTriangle className="h-3 w-3 text-warning" /> Preview unavailable
              </>
            )}
          </div>
          <div className="break-all font-mono leading-relaxed">
            {body ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}
