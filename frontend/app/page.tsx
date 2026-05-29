/**
 * Drip landing page — Phase 1 skeleton.
 *
 * The hero + a single verified-determinism strip so we can boot the dev
 * server and confirm the design system is wired correctly. The full
 * three-pillar grid, dark "watch the agent decide" moment section, and
 * CTA footer ship in Phase 3.
 */

import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VERIFIED_RUN } from "@/lib/contracts";

export default function Home() {
  return (
    <>
      {/* Hero */}
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
              <Button asChild size="lg">
                <Link href="/streams/new">Create a stream</Link>
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

        {/* Soft radial glow under the hero — subtle */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] opacity-50"
          style={{
            background:
              "radial-gradient(50% 60% at 50% 0%, hsl(var(--primary) / 0.18) 0%, transparent 100%)",
          }}
        />
      </section>

      {/* Verified-determinism strip */}
      <section className="container">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <Badge variant="success" className="mb-3">
                Verified on testnet · {VERIFIED_RUN.date}
              </Badge>
              <h2 className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                The autonomous loop ran end-to-end in {VERIFIED_RUN.e2eDurationSec} seconds.
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Three validators independently classified the same input and reached
                deterministic consensus on the verdict — same word, same {VERIFIED_RUN.promptTokens} prompt tokens.
                Auditable end to end.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Stat label="Validators" value={VERIFIED_RUN.validatorConsensus} />
              <Stat label="Prompt tokens" value={String(VERIFIED_RUN.promptTokens)} />
              <Stat label="Cycle" value={`${VERIFIED_RUN.e2eDurationSec}s`} />
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={VERIFIED_RUN.classifierUrl} target="_blank" rel="noopener noreferrer">
                  Receipt #{VERIFIED_RUN.classifierRequestId}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-16">
        <p className="text-center text-sm text-muted-foreground">
          Three-pillar grid, dark agent-decision moment, and CTA section ship in Phase 3.
          This is Phase 1 — design system wired, header / footer / wallet connect live.
        </p>
      </div>
    </>
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
