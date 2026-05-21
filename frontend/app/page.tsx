/**
 * Drip — landing page placeholder.
 *
 * The five demo surfaces, sketched as static markup. Wire up with Wagmi +
 * Viem in Claude Code. These are the surfaces:
 *
 *   1. Hero — what Drip is
 *   2. Stream creation form
 *   3. Stream list (active / paused / completed)
 *   4. Live balance ticker (per-stream)
 *   5. Agent decision feed — THE DEMO MAGIC MOMENT
 *
 * If you build nothing else fancy, build #5 well. Read events from
 * DripPolicies and render them as a real-time activity log.
 */

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <section className="mb-16">
        <p className="text-drip-accent text-sm font-medium uppercase tracking-wider mb-3">
          Built for the Somnia Agentathon
        </p>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Payment streams that watch themselves.
        </h1>
        <p className="text-xl text-drip-muted max-w-2xl leading-relaxed">
          Drip composes Somnia&apos;s on-chain agents with token streaming. When a
          contributor stops shipping, an AI reaches consensus that they&apos;ve gone
          dormant — and the stream pauses itself. No multisig. No governance vote.
          No human in the loop.
        </p>
      </section>

      {/* Quick links / status bar */}
      <section className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusCard label="Network" value="Somnia Testnet" />
        <StatusCard label="Active streams" value="—" />
        <StatusCard label="Total streamed" value="— STT" />
        <StatusCard label="Agent checks today" value="—" />
      </section>

      {/* Create stream form (placeholder) */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Create a stream</h2>
        <div className="bg-drip-surface border border-drip-border rounded-lg p-6">
          <p className="text-drip-muted italic">
            TODO: stream creation form. Recipient, total amount, duration,
            GitHub repo to monitor, check interval. Wire to Drip.createStream
            and DripPolicies.registerPolicy.
          </p>
        </div>
      </section>

      {/* Streams list (placeholder) */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Your streams</h2>
        <div className="bg-drip-surface border border-drip-border rounded-lg p-6">
          <p className="text-drip-muted italic">
            TODO: list of active streams. Per stream: live balance ticker,
            withdrawal button (if recipient), pause/cancel (if sender), and
            current status badge.
          </p>
        </div>
      </section>

      {/* Agent decision feed — THE DEMO MAGIC MOMENT */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Agent decision feed</h2>
        <div className="bg-drip-surface border border-drip-border rounded-lg p-6">
          <p className="text-drip-muted italic">
            TODO (highest priority): live feed of agent activity. Subscribe to
            PolicyCheckStarted, GithubDataFetched, ClassificationReceived, and
            PolicyActionTaken events. Render as a chat-like log with
            timestamps. This is the visible proof of autonomy — make it look
            good.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-24 pt-8 border-t border-drip-border text-sm text-drip-muted">
        <p>
          Drip is an open-source agentic streaming protocol. Built on Somnia&apos;s
          Agentic L1. Source on GitHub.
        </p>
      </footer>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-drip-surface border border-drip-border rounded-lg p-4">
      <p className="text-drip-muted text-xs uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
