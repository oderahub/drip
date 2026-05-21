# PROJECT.md — Context for Claude Code

This file is the single source of truth for the Drip project. Claude Code should read this file at the start of every session before touching any code.

## What this project is

Drip is an agentic payment streaming protocol built for the Somnia Agentathon (May 20 – June 7, 2026). Token streaming (Sablier-style) combined with autonomous on-chain AI judgment that controls stream state without human intervention.

## What's locked

- **Name**: Drip
- **Submission deadline**: June 7, 2026
- **Builder**: Chidera (solo)
- **Reference codebase (shape only)**: github.com/jayteemoney/stackstream
- **Demo vertical**: DAO contributor streaming with GitHub activity verification

## Architecture decisions

- Solidity `^0.8.30` (matches `@somnia-chain/reactivity-contracts` examples)
- Hardhat + Viem (not Foundry, not Ethers)
- Next.js App Router for frontend, deployed on Vercel
- MIT license
- Native STT streams first, MockERC20 included for future ERC-20 support
- Subcommittee size 3, Majority consensus for the classifier
- **Reactivity pattern**: Per-stream self-rescheduling one-shot `Schedule(uint256)` subscriptions. When a stream is created, the first policy check is scheduled. When that check fires and the agent returns, the handler schedules the next check. The chain perpetuates per stream.
- Classifier outputs: `"active"` / `"dormant"` / `"inconclusive"` (constrained via `allowedValues`)
- GitHub activity payload shape: `{username, repo, windowDays, commitCount, prCount, lastCommitTimestamp}`

## Verified facts

- Somnia Testnet: chain ID `50312`, RPC `https://api.infra.testnet.somnia.network`
- Somnia Mainnet: chain ID `5031`, RPC `https://api.infra.mainnet.somnia.network`
- Platform contract testnet: `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`
- Platform contract mainnet: `0x5E5205CF39E766118C01636bED000A54D93163E6`
- JSON API Request agent ID: `13174292974160097713` (0.03 STT/SOMI per validator)
- LLM Inference agent ID: `12847293847561029384` (0.07 STT/SOMI per validator, Qwen3-30B)
- LLM Parse Website agent ID: `12875401142070969085` (0.10 STT/SOMI per validator) — **CURRENTLY BROKEN on testnet, do not use**
- Default subcommittee: 3
- Deposit formula: `getRequestDeposit() + perAgentPrice × subcommitteeSize`
- Reactivity precompile address: `0x0100`
- Subscription owner minimum balance: 32 native tokens at subscription creation
- System events emitter: `0x100` for BlockTick / EpochTick / Schedule

## Critical gotchas to never forget

1. **Floor-only deposit anti-pattern**: Never send only `getRequestDeposit()`. Always add `perAgentPrice × subcommitteeSize`. The contract accepts the floor-only deposit but `perAgentBudget = 0`, runners skip the request, and it returns `status = 3` (Failed), not TimedOut as the older docs imply.
2. **Always implement `receive() external payable`**: rebates are pushed at finalisation. Without it, transfers fail silently.
3. **Always gate callbacks**: `require(msg.sender == address(platform), "Only platform")` and `require(pendingRequests[requestId], "Unknown request")`.
4. **Always handle every status**: `Success`, `Failed`, `TimedOut`. Decoding `responses[0].result` on a non-Success callback reverts.
5. **The example repo's `ISomniaAgents.sol` is missing the `perAgentBudget` field**. We use the corrected interface in `contracts/contracts/interfaces/IAgentRequester.sol`.
6. **Drip contract must hold ≥32 STT** when it first calls `subscribe()` from its constructor. Deploy script funds it with 35 STT.
7. **The handler's gas limit on reactive transactions** should leave a 1M gas reserve for Somnia storage operations. Use 2M gas as the default.
8. **Never use LLM Parse Website on testnet yet** — service-side HTTP 400 failures across all validators. Reproducible request IDs 51509 and 51510.

## What's built / not built

Use this checklist to track progress:

- [ ] `Drip.sol` — streaming primitive (skeleton in repo, bodies marked TODO)
- [ ] `DripPolicies.sol` — agent-control layer (skeleton in repo)
- [ ] Hardhat config + deploy script
- [ ] BTC price oracle smoke test (canonical first integration from SomniaDevs article)
- [ ] Classifier determinism test (20+ runs against real GitHub data)
- [ ] Frontend wallet connect
- [ ] Frontend stream creation form
- [ ] Frontend live stream balance ticker
- [ ] Frontend agent decision feed (demo-critical)
- [ ] Demo video script
- [ ] Pitch deck
- [ ] Live deployment

## Working style

- Plan before coding. Write the interface first, then the implementation.
- Test each agent invocation in isolation before composing.
- Verify on testnet with real transaction hashes; trust nothing that runs only in a unit test.
- Commit frequently. Git history is a second memory.
- Use the skill files in `skills/` as the source of truth for Somnia-specific patterns — they encode hard-won bugs the docs don't yet teach.
