/**
 * Drip landing page.
 *
 * Narrative rhythm:
 *   1. Hero (light)          — what Drip is
 *   2. Pillars (light)        — how the three primitives compose
 *   3. Agent decision (dark)  — watch it happen
 *   4. Verified strip (light) — the proof
 *   5. CTA (dark)             — open testnet
 *
 * The dark sections punctuate the light flow, mirroring arcpay's
 * use-dark-as-a-moment pattern. The pillows-soft radius (0.875rem
 * base) and white-card-on-cream contrast give every section the
 * lifted-without-shadow feel.
 */

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PillarsSection } from "@/components/sections/pillars";
import { AgentDecisionMockSection } from "@/components/sections/agent-decision-mock";
import { CTABand } from "@/components/sections/cta-band";
import { VERIFIED_RUN } from "@/lib/contracts";

export default function Home() {
  return (
    <>
      <Hero />
      <PillarsSection />
      <AgentDecisionMockSection />
      <VerifiedStrip />
      <CTABand />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container relative pb-20 pt-16 sm:pt-24 lg:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="default" className="mb-6 gap-1.5 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5" />
            Built for the Somnia Agentathon
          </Badge>

          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Streams that{" "}
            <span className="bg-gradient-to-br from-primary to-success bg-clip-text text-transparent">
              pause themselves
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Token streaming controlled by on-chain AI. When a contributor stops shipping,
            an agent reaches consensus and pauses payment — no multisig, no governance vote,
            no human in the loop.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/streams/new">
                Create a stream
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">View streams</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Somnia testnet · Chain ID 50312 · Source-verified on Shannon
          </p>
        </div>
      </div>

      {/* Soft emerald glow under the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] opacity-50"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, hsl(var(--primary) / 0.18) 0%, transparent 100%)",
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Verified-determinism evidence strip                                 */
/* ------------------------------------------------------------------ */

function VerifiedStrip() {
  return (
    <section className="container py-20 sm:py-24">
      <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <Badge variant="success" className="mb-3">
              Verified on testnet · {VERIFIED_RUN.date}
            </Badge>
            <h2 className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              The autonomous loop ran end-to-end in {VERIFIED_RUN.e2eDurationSec} seconds.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Three validators independently classified the same input and reached
              deterministic consensus on the verdict — same word,
              same {VERIFIED_RUN.promptTokens} prompt tokens, every time.
              Auditable end to end.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Stat label="Validators" value={VERIFIED_RUN.validatorConsensus} />
            <Stat label="Prompt tokens" value={String(VERIFIED_RUN.promptTokens)} />
            <Stat label="Cycle" value={`${VERIFIED_RUN.e2eDurationSec}s`} />
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a
                href={VERIFIED_RUN.classifierUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Receipt #{VERIFIED_RUN.classifierRequestId}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 px-3.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-numeric text-sm font-semibold">{value}</p>
    </div>
  );
}
