# Drip

**Autonomous payment streaming on Somnia's Agentic L1.**

Drip turns AI judgment into autonomous payment flows. When a contributor stops delivering, an AI agent reaches consensus that they've gone dormant — and the stream pauses itself. No DAO multisig, no governance vote, no human in the loop. Just a deterministic AI decision moving real money on Somnia.

---

## Why this exists

Smart contracts can verify code, but they can't exercise judgment. When a DAO needs to decide if a contributor is still active, that judgment lives off-chain — in a multisig, a governance vote, or a single admin's discretion. Drip changes that.

On Somnia, AI runs inside consensus. So judgment can be autonomous, verifiable, and on-chain. Drip composes three Somnia primitives — JSON API Request, LLM Inference, and Reactivity — into a single self-perpetuating loop: payment streams that observe the world, classify what they see, and adjust themselves accordingly.

## What it does

1. A DAO creates a payment stream to a contributor (e.g. 1000 STT over 30 days, ~0.0003858 STT/sec).
2. The stream registers an activity policy: "Check this GitHub repo every 7 days. If the contributor commits less than 3 times AND opens no PRs, pause the stream."
3. On the schedule, Drip wakes itself via a Somnia Reactivity subscription.
4. The handler invokes the JSON API Request agent to fetch GitHub activity.
5. The handler invokes the LLM Inference agent to classify the contributor as `active` / `dormant` / `inconclusive`.
6. Based on the classification, the stream pauses, resumes, or continues unchanged.
7. The handler schedules the next policy check 7 days out.

The cycle repeats. No human intervention. Every decision auditable via Somnia's agent receipts.

## Why this could only exist on Somnia

No other EVM-compatible chain runs deterministic LLM inference inside validator consensus. On any other chain, the classification step would require an off-chain oracle — reintroducing the centralised middleman that smart contracts were supposed to remove. Somnia's agents make the AI verdict a first-class on-chain primitive.

Combined with on-chain Reactivity (subscriptions that schedule themselves into future blocks without an external keeper) and 100ms block times, Drip operates as a fully self-perpetuating autonomous system. The contract is the only actor.

## Architecture

- **`Drip.sol`** — the streaming primitive. Sablier-style per-second rate math. Tracks streams, accrued balances, statuses (Active / Paused / Cancelled / Completed). Inherits from `SomniaEventHandler` so the reactivity precompile can call it back when scheduled checks fire.
- **`DripPolicies.sol`** — the agent-control layer. Holds per-stream policy configuration (GitHub repo, check interval, threshold criteria). Coordinates the JSON API → LLM Inference → action loop.
- **Reactivity** — each active stream maintains a one-shot Schedule subscription. When the subscription fires, the next one schedules itself. Self-perpetuating chain per stream.
- **Agents** — JSON API Request fetches the GitHub activity payload, LLM Inference classifies it using a `Role / Task / Data / Output` prompt structure with `allowedValues = ["active", "dormant", "inconclusive"]` for deterministic three-way consensus.

## What's possible next

The streaming + agentic-judgment primitive generalises beyond DAO contributors:

- **Grant streaming** — grant programs that auto-pause when projects stop shipping
- **Vesting with conditions** — token vesting tied to verifiable real-world milestones
- **Subscription streaming with usage verification** — pay-per-use SaaS that pauses when usage drops
- **Freelance retainer escrow** — continuous payment with weekly deliverable verification
- **Performance-based payroll** — base rate + AI-classified performance multiplier

Each vertical uses the same primitive with a different classifier prompt.

## Tech

- Solidity `^0.8.30` on Somnia (chain ID `50312` testnet, `5031` mainnet)
- `@somnia-chain/reactivity-contracts` for on-chain reactivity
- Hardhat + Viem for development and deploy
- Next.js (App Router) + Tailwind for the dashboard
- Vercel for live deployment

## Built for

The [Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) (Encode Club × Somnia, May 20 – June 7, 2026).

## License

MIT