# Demo video script — Drip

_Target length: 2-5 minutes. The hackathon brief allows up to 5 but judges typically prefer 3-3.5._

## Opening (15-20 seconds) — the problem

(Echoing Peter Lipka's framing without copying it.)

> Smart contracts can verify code. They can move tokens. They can branch on chain state.
>
> What they cannot do, natively, is exercise judgment. When a DAO needs to decide if a contributor is still active, that judgment lives off-chain — in a multisig, a governance vote, or a single admin's discretion.
>
> Drip changes that.

Show: a stylized text overlay or static title card.

## What Drip is (15-20 seconds)

> Drip is autonomous payment streaming on Somnia's Agentic L1.
>
> Drip composes Somnia's deterministic AI agents, JSON API Request agents, and on-chain Reactivity into a single self-perpetuating loop. The stream observes the world, classifies what it sees, and adjusts itself.

Show: high-level architecture diagram, static, with the three Somnia primitives highlighted.

## Live demo (90-120 seconds) — the magic moment

### Setup (15 seconds)

> Here, I'll create a stream paying a contributor 100 STT over 7 days, with an activity policy: check their GitHub repo every 60 seconds [shortened for demo]. If they go quiet, pause the stream.

Show: stream creation form, fill in fields, submit. Screen capture the transaction.

### The wait (15 seconds)

> The stream is now live. Funds drip to the recipient by the second. The next agent check is scheduled.

Show: stream dashboard. Recipient balance ticks up visibly. Status badge shows "Active. Next check in: 58s".

### The decision (30 seconds)

> The check fires. Drip's reactivity handler invokes the JSON API Request agent. Three validators each fetch the GitHub data. The data goes into the LLM Inference agent. Three validators each classify the contributor as "active", "dormant", or "inconclusive". Consensus is reached. The result is delivered back to Drip.

Show: agent decision feed updates live as the events fire:
- 12:04:01  Agent check started
- 12:04:03  GitHub data fetched: 0 commits, 0 PRs in 7 days
- 12:04:06  LLM classifier verdict: DORMANT
- 12:04:06  Action: stream paused

Show: stream status changes from "Active" to "Paused — agent classified as dormant".

### The recovery (30 seconds)

> Now I push a commit to the watched repo. Next check, the agent sees activity.

Show: a git commit terminal command, then the next agent check.
- 12:05:06  Agent check started
- 12:05:08  GitHub data fetched: 4 commits in 7 days
- 12:05:11  LLM classifier verdict: ACTIVE
- 12:05:11  Action: stream resumed

Show: stream status changes back to "Active". Balance ticker resumes.

## Why Somnia (15-20 seconds)

> This couldn't exist on Ethereum or Solana — neither runs deterministic LLM inference inside validator consensus. It couldn't exist with off-chain oracles — that would reintroduce the centralized middleman smart contracts were built to remove.
>
> On Somnia, AI is part of consensus. The agent's verdict is on-chain. The schedule is on-chain. The action is on-chain. Drip is a single self-contained autonomous system.

Show: a three-card layout — "Deterministic LLM consensus", "On-chain Reactivity scheduling", "100ms blocks".

## What's possible next (15-20 seconds)

> The streaming + agentic judgment primitive isn't just for DAO contributors.
>
> Grant programs that auto-pause when projects stop shipping. Vesting schedules tied to verifiable real-world milestones. Subscription billing that adjusts to actual usage. Performance-based payroll. Each vertical reuses the primitive with a different classifier prompt.

Show: four vertical pills with one-line descriptions.

## Closing (10 seconds)

> Drip is open-source. Live on Somnia testnet. Built for the Agentathon.
>
> Drip.

Show: GitHub link, live demo link, ENS or wallet address.

---

## Notes for recording

- Use a clean dark theme on the browser
- Block out the wallet seed phrase areas
- Record at 1080p minimum
- Keep cursor visible and movement smooth
- Voice-over should be calm and confident — not marketing energy, builder energy
- If the testnet is slow, pre-record the agent check and edit it in
- Practice the demo 5+ times before recording
- Have a "happy path" backup deployment in case live testnet fails during recording

## Editing checklist

- [ ] Captions for accessibility
- [ ] Title card with project name + Agentathon framing
- [ ] No live wallet addresses visible (use display names or first/last 4)
- [ ] Music: subtle, low-volume background — avoid overpowering the voice-over
- [ ] End card with GitHub link, live demo URL, and contact
