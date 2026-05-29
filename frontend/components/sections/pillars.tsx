import { Droplets, Activity, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pillar {
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    num: "01",
    icon: Droplets,
    title: "Stream",
    body: "Open a payment channel between any two addresses. Funds accrue per-second from sender to recipient. Pause, resume, or cancel — your stream, your control.",
  },
  {
    num: "02",
    icon: Activity,
    title: "Observe",
    body: "Register a policy that tells Drip what to watch. On a schedule you choose, Somnia's on-chain agents fetch the source of truth and reach consensus on what they see.",
  },
  {
    num: "03",
    icon: Pause,
    title: "Adjust",
    body: "Based on the agent's verdict, the stream adjusts itself. Active contributor → keep paying. Dormant → pause until they return. Inconclusive → defer to the next check.",
  },
];

export function PillarsSection() {
  return (
    <section id="how" className="container py-20 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          How it works
        </p>
        <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          One stream, three primitives.
        </h2>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          Drip composes Somnia's reactivity precompile with on-chain JSON API and
          LLM Inference agents. The contract is the only actor.
        </p>
      </div>

      <ol className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {PILLARS.map((p, i) => (
          <PillarCard key={p.num} {...p} index={i} />
        ))}
      </ol>
    </section>
  );
}

function PillarCard({
  num,
  icon: Icon,
  title,
  body,
  index,
}: Pillar & { index: number }) {
  return (
    <li
      className={cn(
        // White card on cream background — depth via contrast, no shadow
        "group relative flex flex-col rounded-3xl border border-border bg-card p-6 transition-all hover:border-primary/30 sm:p-7",
        // Subtle lift on hover
        "hover:-translate-y-0.5 hover:bg-card/95"
      )}
      style={{ transitionDelay: `${index * 30}ms` }}
    >
      <div className="mb-6 flex items-center justify-between">
        <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground/70">
          {num}
        </span>
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
