# Pitch deck outline — Drip

_8-9 slides. Build in Pitch.com, Slides, or Keynote. Don't over-design — judges value substance over slickness._

## Slide 1 — Title

- Project name: Drip
- One-line pitch: Autonomous payment streaming on Somnia's Agentic L1
- Submitted to: Somnia Agentathon (Encode Club × Somnia)
- Builder: Chidera
- Date: June 7, 2026

## Slide 2 — The problem

- Smart contracts can verify code but cannot exercise judgment
- When a DAO needs to decide "is this contributor active?", the decision lives in a multisig, a governance vote, or a single admin
- This is the gap on-chain AI was meant to fill — but until now, on-chain AI required an oracle (a trusted middleman)
- Headline: "Smart contracts don't have judgment. Drip gives them one."

## Slide 3 — The solution

- Drip = payment streaming + on-chain agentic judgment
- The contract observes the world (JSON API Request), classifies what it sees (LLM Inference), and acts on its judgment (Reactivity)
- No human in the loop after the stream is configured
- One sentence: "Streams that watch themselves."

## Slide 4 — How it works (architecture)

- Two contracts: Drip (streaming primitive) and DripPolicies (agent-control layer)
- Three Somnia primitives composed: JSON API Request + LLM Inference + Reactivity
- Self-perpetuating loop: each policy check schedules the next
- Diagram: the four-step loop (schedule → fetch → classify → act → schedule next)

## Slide 5 — Live demo

- 30-second GIF of the demo, embedded if the platform allows; otherwise a static screenshot of the dashboard with the agent decision feed visible
- Link to the live deployment
- "Watch the AI pause the stream when the contributor goes quiet"

## Slide 6 — Why only Somnia

- Three reasons in cards or columns:
  1. Deterministic LLM inference inside validator consensus
  2. On-chain Reactivity scheduling (no off-chain keepers)
  3. 100ms blocks make sub-second autonomous responses possible
- Closing line: "On any other chain, this would be an oracle. On Somnia, it's a primitive."

## Slide 7 — What's possible next

- Same primitive, different verticals:
  - Grant streaming (pause non-shipping projects)
  - Conditional vesting (tied to verifiable milestones)
  - Usage-adjusted subscriptions
  - Performance-based payroll
  - Freelance retainers with deliverable verification
- Each vertical reuses Drip, only the classifier prompt changes

## Slide 8 — Tech stack

- Solidity 0.8.30 + @somnia-chain/reactivity-contracts
- Hardhat + Viem
- Next.js + Tailwind, deployed on Vercel
- All code open-source on GitHub
- Built and shipped in 19 days, solo

## Slide 9 — Contact / ask

- GitHub URL
- Live demo URL
- Builder: Chidera (Lagos, Nigeria)
- Twitter / X handle
- "Open to: full-time roles, grants, collaboration"

## Design notes

- Dark theme matching the product
- One key message per slide, no walls of text
- Real screenshots > stock illustrations
- Diagram on slide 4 should be clean, not busy
- Avoid AI / blockchain stock imagery

## What to include in the README that's redundant with the deck

The deck is for visual impact. The README is for technical depth. The README should expand on slides 4 and 6 in detail. The deck does NOT need to be a complete document — it needs to make a judge want to look at the live demo and GitHub.
