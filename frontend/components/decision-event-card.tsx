"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Calendar,
  Download,
  Brain,
  PauseCircle,
  PlayCircle,
  CircleDot,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The data shape for one event in the agent decision feed.
 *
 * Both the Phase 3 marketing mock (autoplay scripted sequence) and the
 * Phase 5 live feed (real-time chain events via viem watchContractEvent)
 * compose `DecisionEventCard` over this exact shape — only the source
 * of events differs.
 */
export type FeedEvent =
  | {
      type: "policy-registered";
      timestamp: Date;
      username: string;
      repo: string;
      intervalSec: number;
    }
  | {
      type: "schedule-fired";
      timestamp: Date;
      intervalSec: number;
    }
  | {
      type: "github-fetched";
      timestamp: Date;
      commitCount: number;
      prCount: number;
      bytesIn: number;
      receiptUrl?: string;
    }
  | {
      type: "classification";
      timestamp: Date;
      verdict: "active" | "dormant" | "inconclusive";
      validatorCount: number;
      unanimous: boolean;
      promptTokens: number;
      completionTokens: number;
      receiptUrl?: string;
    }
  | {
      type: "action";
      timestamp: Date;
      kind: "pause" | "resume" | "noop";
      verdict: "active" | "dormant" | "inconclusive";
    };

export type Surface = "light" | "onDark";

interface DecisionEventCardProps {
  event: FeedEvent;
  surface?: Surface;
  isLatest?: boolean;
  index?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Per-event visual config                                            */
/* ------------------------------------------------------------------ */

interface VisualSpec {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Tailwind text colour for the dot + glyph (on light surface) */
  light: string;
  /** Tailwind text colour for the dot + glyph (on dark surface) */
  onDark: string;
}

function visualFor(event: FeedEvent): VisualSpec {
  switch (event.type) {
    case "policy-registered":
      return {
        icon: CircleDot,
        label: "Policy registered",
        light: "text-muted-foreground",
        onDark: "text-white/60",
      };
    case "schedule-fired":
      return {
        icon: Calendar,
        label: "Schedule fired",
        light: "text-foreground/80",
        onDark: "text-white/80",
      };
    case "github-fetched":
      return {
        icon: Download,
        label: "GitHub data fetched",
        light: "text-success",
        onDark: "text-success",
      };
    case "classification":
      return {
        icon: Brain,
        label: "Classification received",
        light: verdictTextLight(event.verdict),
        onDark: verdictTextOnDark(event.verdict),
      };
    case "action":
      return {
        icon: event.kind === "pause" ? PauseCircle : event.kind === "resume" ? PlayCircle : CircleDot,
        label:
          event.kind === "pause"
            ? "Stream paused"
            : event.kind === "resume"
              ? "Stream resumed"
              : "No action taken",
        light: actionTextLight(event.kind),
        onDark: actionTextOnDark(event.kind),
      };
  }
}

function verdictTextLight(v: "active" | "dormant" | "inconclusive"): string {
  return {
    active: "text-primary",
    dormant: "text-state-paused",
    inconclusive: "text-state-inconclusive",
  }[v];
}
function verdictTextOnDark(v: "active" | "dormant" | "inconclusive"): string {
  return {
    active: "text-primary",
    dormant: "text-indigo-300",
    inconclusive: "text-amber-300",
  }[v];
}
function actionTextLight(k: "pause" | "resume" | "noop"): string {
  return {
    pause: "text-state-paused",
    resume: "text-primary",
    noop: "text-muted-foreground",
  }[k];
}
function actionTextOnDark(k: "pause" | "resume" | "noop"): string {
  return {
    pause: "text-indigo-300",
    resume: "text-primary",
    noop: "text-white/55",
  }[k];
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

export function DecisionEventCard({
  event,
  surface = "light",
  isLatest = false,
  index = 0,
  className,
}: DecisionEventCardProps) {
  const v = visualFor(event);
  const Icon = v.icon;
  const dotColor = surface === "onDark" ? v.onDark : v.light;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.36,
        ease: [0.16, 1, 0.3, 1],
        delay: index * 0.18,
      }}
      className={cn("relative pl-8 sm:pl-10", className)}
    >
      {/* Timeline gutter — vertical line + dot */}
      <div
        aria-hidden
        className={cn(
          "absolute left-3 top-0 bottom-[-12px] w-px sm:left-4",
          surface === "onDark" ? "bg-white/12" : "bg-border"
        )}
      />
      <div
        aria-hidden
        className={cn(
          "absolute left-[5px] top-6 flex h-2.5 w-2.5 items-center justify-center rounded-full sm:left-[9px]",
          surface === "onDark" ? "bg-white/15" : "bg-card",
          "ring-2",
          surface === "onDark" ? "ring-surface-dark" : "ring-background"
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColor.replace("text-", "bg-"))} />
      </div>

      {/* Card body */}
      <CardBody event={event} surface={surface} visual={v} isLatest={isLatest} dotColor={dotColor} Icon={Icon} />
    </motion.div>
  );
}

function CardBody({
  event,
  surface,
  visual,
  isLatest,
  dotColor,
  Icon,
}: {
  event: FeedEvent;
  surface: Surface;
  visual: VisualSpec;
  isLatest: boolean;
  dotColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  // Action cards (the autonomous moment) get an emphasised treatment —
  // tinted background + faint outer ring + larger title.
  const isActionPause = event.type === "action" && event.kind === "pause";
  const isActionResume = event.type === "action" && event.kind === "resume";
  const emphasised = isLatest && (isActionPause || isActionResume);

  const baseClass =
    surface === "onDark"
      ? "border border-white/10 bg-white/[0.03] backdrop-blur-sm"
      : "border border-border bg-card";

  const emphClass = emphasised
    ? surface === "onDark"
      ? isActionPause
        ? "border-indigo-400/35 bg-indigo-400/[0.06] ring-1 ring-indigo-400/15"
        : "border-primary/40 bg-primary/[0.06] ring-1 ring-primary/15"
      : isActionPause
        ? "border-state-paused/30 bg-state-paused-bg ring-1 ring-state-paused/15"
        : "border-primary/30 bg-primary/5 ring-1 ring-primary/15"
    : "";

  return (
    <div className={cn("rounded-2xl p-4 sm:p-5", baseClass, emphClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon className={cn("h-4 w-4 shrink-0", dotColor)} />
          <h3
            className={cn(
              "font-semibold leading-tight tracking-tight",
              emphasised ? "text-base" : "text-sm",
              surface === "onDark" ? "text-white/95" : "text-foreground"
            )}
          >
            {visual.label}
          </h3>
        </div>
        <time
          className={cn(
            "shrink-0 text-[11px] font-medium",
            surface === "onDark" ? "text-white/45" : "text-muted-foreground"
          )}
        >
          {formatRelative(event.timestamp)}
        </time>
      </div>

      <div className="mt-2">
        <Body event={event} surface={surface} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-event body content                                             */
/* ------------------------------------------------------------------ */

function Body({ event, surface }: { event: FeedEvent; surface: Surface }) {
  const text = surface === "onDark" ? "text-white/70" : "text-muted-foreground";
  const strong = surface === "onDark" ? "text-white/90" : "text-foreground/85";
  const mono = surface === "onDark" ? "text-white/85" : "text-foreground/80";

  switch (event.type) {
    case "policy-registered":
      return (
        <p className={cn("text-sm leading-relaxed", text)}>
          Watching{" "}
          <span className={cn("font-mono text-xs", mono)}>
            {event.username}/{event.repo}
          </span>{" "}
          every {event.intervalSec}s.
        </p>
      );

    case "schedule-fired":
      return (
        <p className={cn("text-sm leading-relaxed", text)}>
          Reactivity precompile woke the contract.{" "}
          <span className={strong}>{event.intervalSec}-second</span> policy interval.
        </p>
      );

    case "github-fetched":
      return (
        <div className="space-y-2">
          <p className={cn("text-sm leading-relaxed", text)}>
            Aggregator returned the activity payload.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Pill surface={surface}>
              <span className="font-mono">{event.commitCount}</span> commits
            </Pill>
            <Pill surface={surface}>
              <span className="font-mono">{event.prCount}</span> PRs
            </Pill>
            <Pill surface={surface}>
              <span className="font-mono">{event.bytesIn}B</span> in
            </Pill>
            {event.receiptUrl && <ReceiptLink href={event.receiptUrl} surface={surface} />}
          </div>
        </div>
      );

    case "classification": {
      const verdictColor =
        surface === "onDark"
          ? verdictTextOnDark(event.verdict)
          : verdictTextLight(event.verdict);
      return (
        <div className="space-y-2">
          <p className={cn("text-sm leading-relaxed", text)}>
            Three validators ran Qwen3-30B independently.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Pill surface={surface}>
              Verdict <span className={cn("font-semibold", verdictColor)}>“{event.verdict}”</span>
            </Pill>
            {event.unanimous && (
              <Pill surface={surface} variant="success">
                <CheckCircle2 className="h-3 w-3" />
                {event.validatorCount}/{event.validatorCount} unanimous
              </Pill>
            )}
            <Pill surface={surface}>
              <span className="font-mono">
                {event.promptTokens}/{event.completionTokens}
              </span>{" "}
              tokens
            </Pill>
            {event.receiptUrl && <ReceiptLink href={event.receiptUrl} surface={surface} />}
          </div>
        </div>
      );
    }

    case "action": {
      const verdictColor =
        surface === "onDark"
          ? verdictTextOnDark(event.verdict)
          : verdictTextLight(event.verdict);
      return (
        <p className={cn("text-sm leading-relaxed", text)}>
          Verdict{" "}
          <span className={cn("font-semibold", verdictColor)}>“{event.verdict}”</span>{" "}
          dispatched.{" "}
          {event.kind === "pause" && (
            <span className={strong}>Stream pauses until the agent's next check signals recovery.</span>
          )}
          {event.kind === "resume" && (
            <span className={strong}>Stream resumes flowing from where it left off.</span>
          )}
          {event.kind === "noop" && (
            <span className={strong}>Status held; next check in 60 s.</span>
          )}
        </p>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Pill + link primitives                                             */
/* ------------------------------------------------------------------ */

function Pill({
  children,
  surface = "light",
  variant,
}: {
  children: React.ReactNode;
  surface?: Surface;
  variant?: "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
        surface === "onDark"
          ? "bg-white/[0.06] text-white/80 ring-1 ring-white/10"
          : "bg-muted text-muted-foreground",
        variant === "success" &&
          (surface === "onDark"
            ? "bg-success/15 text-success ring-success/25"
            : "bg-success/15 text-success")
      )}
    >
      {children}
    </span>
  );
}

function ReceiptLink({ href, surface }: { href: string; surface: Surface }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        surface === "onDark"
          ? "text-white/75 hover:text-white"
          : "text-primary hover:text-primary/85"
      )}
    >
      Receipt <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility — relative time short form for marketing mock              */
/* ------------------------------------------------------------------ */

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}
