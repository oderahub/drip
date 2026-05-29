"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Clock, ShieldCheck, Sparkles } from "lucide-react";
import {
  DecisionEventCard,
  type FeedEvent,
} from "@/components/decision-event-card";
import { Button } from "@/components/ui/button";
import { VERIFIED_RUN } from "@/lib/contracts";

/**
 * Marketing-page mock of the agent decision feed.
 *
 * Renders a scripted 5-event sequence taken from the M4 Step D testnet
 * run (request 2094063, May 26 2026 — the dormant→pause cycle that
 * completed in 70 seconds). Cards stagger in via framer-motion when
 * the section scrolls into view, then stay still.
 *
 * Phase 5's live `/streams/[id]` page composes the same
 * `DecisionEventCard` over real-time chain events.
 */

const MARKETING_EVENTS: FeedEvent[] = (() => {
  // Anchor the relative timestamps to "now − a few minutes" so the
  // marketing block always reads as fresh, regardless of when the page
  // is rendered.
  const now = Date.now();
  const ago = (sec: number) => new Date(now - sec * 1000);
  return [
    {
      type: "policy-registered",
      timestamp: ago(310),
      username: "drip-dormant-test-xyz",
      repo: "vercel/next.js",
      intervalSec: 60,
    },
    {
      type: "schedule-fired",
      timestamp: ago(250),
      intervalSec: 60,
    },
    {
      type: "github-fetched",
      timestamp: ago(243),
      commitCount: 0,
      prCount: 0,
      bytesIn: 90,
      receiptUrl: "https://agents.testnet.somnia.network/receipts/2094056",
    },
    {
      type: "classification",
      timestamp: ago(240),
      verdict: "dormant",
      validatorCount: 3,
      unanimous: true,
      promptTokens: 267,
      completionTokens: 8,
      receiptUrl: "https://agents.testnet.somnia.network/receipts/2094063",
    },
    {
      type: "action",
      timestamp: ago(240),
      kind: "pause",
      verdict: "dormant",
    },
  ];
})();

export function AgentDecisionMockSection() {
  return (
    <section className="relative overflow-hidden bg-surface-dark text-surface-dark-foreground">
      {/* Subtle dotted grain */}
      <div aria-hidden className="absolute inset-0 bg-grain opacity-60" />
      {/* Top emerald glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] opacity-50"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, hsl(var(--primary) / 0.18) 0%, transparent 100%)",
        }}
      />

      <div className="container relative py-20 sm:py-28">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Left — narrative */}
          <div className="lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              The autonomous loop
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Watch the agent decide.
            </h2>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-white/70">
              Somnia&apos;s reactivity precompile wakes the contract on schedule.
              The JSON API agent fetches the source of truth. The LLM agent
              classifies it. The action dispatches itself.
            </p>
            <p className="mt-3 max-w-md text-pretty text-base leading-relaxed text-white/70">
              From the chain&apos;s first heartbeat to the stream pausing:{" "}
              <span className="font-semibold text-white">
                {VERIFIED_RUN.e2eDurationSec} seconds
              </span>
              .
            </p>

            <div className="mt-8 grid max-w-md grid-cols-3 gap-3 sm:gap-4">
              <Stat icon={ShieldCheck} label="Validators" value={VERIFIED_RUN.validatorConsensus} />
              <Stat icon={Sparkles} label="Tokens" value={`${VERIFIED_RUN.promptTokens}/8`} />
              <Stat icon={Clock} label="Cycle" value={`${VERIFIED_RUN.e2eDurationSec}s`} />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="onDark" size="default">
                <a
                  href={VERIFIED_RUN.classifierUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  Audit receipt #{VERIFIED_RUN.classifierRequestId}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
              <a
                href="https://github.com/oderahub/drip/blob/main/docs/TESTNET_RUN.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-white/75 transition-colors hover:text-white"
              >
                Full run log
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Right — the feed mock */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="space-y-3"
            >
              {/* Reverse so the most recent event renders at the top */}
              {[...MARKETING_EVENTS].reverse().map((ev, i, arr) => (
                <DecisionEventCard
                  key={`${ev.type}-${i}`}
                  event={ev}
                  surface="onDark"
                  isLatest={i === 0}
                  index={arr.length - 1 - i}
                />
              ))}
            </motion.div>

            <p className="mt-6 px-2 text-center text-xs text-white/45">
              Scripted from a real testnet cycle · {VERIFIED_RUN.date}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-white/55">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
