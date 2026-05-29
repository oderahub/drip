import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADDRESSES } from "@/lib/contracts";
import { shortAddress } from "@/lib/utils";

export function CTABand() {
  return (
    <section className="relative overflow-hidden bg-surface-dark text-surface-dark-foreground">
      <div aria-hidden className="absolute inset-0 bg-grain opacity-50" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] opacity-50"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 100%, hsl(var(--primary) / 0.18) 0%, transparent 100%)",
        }}
      />

      <div className="container relative py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to make your streams{" "}
            <span className="bg-gradient-to-br from-primary to-emerald-300 bg-clip-text text-transparent">
              think for themselves
            </span>
            ?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/70">
            Open testnet. Source-verified contracts. No keys required to read.
            Connect a wallet to create your first stream — pause and resume happen
            on their own.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="onDark" className="gap-2">
              <Link href="/streams/new">
                Create a stream
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="text-white hover:bg-white/[0.08] hover:text-white"
            >
              <Link href="/dashboard">View streams</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/55">
            <ContractLink label="Drip" addr={ADDRESSES.testnet.drip} />
            <ContractLink label="DripPolicies" addr={ADDRESSES.testnet.dripPolicies} />
            <span className="font-mono">Chain ID 50312</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContractLink({ label, addr }: { label: string; addr: string }) {
  return (
    <a
      href={`https://shannon-explorer.somnia.network/address/${addr}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
    >
      <span>{label}</span>
      <span className="font-mono text-white/40">{shortAddress(addr)}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
