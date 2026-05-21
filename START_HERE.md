# START HERE

Your first hour. Don't skip steps.

## 1. Read this, then read PROJECT.md and the skill files

- `PROJECT.md` — what the project is and what's locked
- `skills/SKILL.md` — index of the three skill files
- `skills/skill-agents.md` — Somnia Agents patterns and gotchas
- `skills/skill-reactivity.md` — Somnia Reactivity patterns
- `skills/skill-streaming.md` — Drip-specific architecture rules

These are loaded automatically by Claude Code. You should also read them once yourself.

## 2. Install dependencies (contracts workspace)

```bash
cd contracts
npm install
```

## 3. Set up environment

```bash
cp .env.example .env
```

Edit `.env`:
- `PRIVATE_KEY=0x...` — testnet deployer key (must hold ≥50 STT)
- Other values are pre-filled with testnet defaults

## 4. Faucet up

You need at least **50 STT** in your testnet wallet:
- 35 STT will be sent to the Drip contract at deploy time (to satisfy the 32 STT subscription owner minimum)
- ~5 STT for agent invocations during testing (0.12 STT per JSON API call, 0.24 STT per LLM Inference call)
- ~10 STT buffer for gas + retries

Faucet sources:
- [https://testnet.somnia.network/](https://testnet.somnia.network/) (web faucet)
- Discord `#dev-chat`, tag `@emreyeth`
- Somnia Developer Telegram

## 5. Verify everything compiles

```bash
cd contracts
npx hardhat compile
```

Should compile cleanly. If not, fix before doing anything else.

## 6. Run the smoke test

This is the canonical "tiny end-to-end demo already working" from the SomniaDevs article. It deploys a BTC price oracle, invokes it, and verifies the callback fires with a real price.

```bash
npx hardhat run scripts/test-agent-invocation.ts --network somniaTestnet
```

Expected output: a deployed contract address, a request ID, and within ~15 seconds a callback log showing the BTC/USD price.

**If this fails, do not proceed.** Debug the smoke test until it works. Every other agent invocation in Drip follows the same pattern, so a working smoke test means the foundation is correct.

## 7. Test classifier determinism

This is the single highest-risk technical test. If the LLM Inference classifier returns inconsistent results across validators or runs, the demo will eventually fail in front of judges.

```bash
npx hardhat run scripts/test-classifier.ts --network somniaTestnet
```

The script runs the GitHub-activity classifier prompt 20 times against fake payloads at three threshold boundaries. Expected: all 20 runs return the expected classification for each input. If even one flips, tighten the prompt before building further.

## 8. Open Claude Code in this directory

```bash
# from the drip/ root
claude-code
```

First prompt to Claude Code:

> Continuing work on Drip — an agentic streaming protocol for the Somnia Agentathon. Read PROJECT.md, then read all three skill files in skills/. Then walk me through the contracts/contracts/Drip.sol skeleton and propose what we should build first.

## 9. The build sequence

Week 1 (May 20 – 26): streaming primitive in Solidity
- Implement `createStream`, `withdraw`, `pause`, `resume`, `cancel`
- Write tests for stream math (per-second accrual, paused-time exclusion)
- Deploy to testnet, manually exercise via Hardhat scripts

Week 2 (May 27 – June 2): agent integration
- Wire `DripPolicies.sol` JSON API Request call for GitHub data
- Wire the LLM Inference classifier
- Wire Reactivity scheduling (one-shot Schedule subscription per stream)
- End-to-end test: create a stream → policy check fires → classifier runs → stream pauses

Week 3 (June 3 – 7): frontend, demo, submission
- Frontend wallet connect + stream creation form + live balance ticker + agent decision feed
- Deploy frontend to Vercel
- Record 2-5 minute demo video
- Write 8-9 slide deck
- Submit by June 7

## When to come back to chat (not Claude Code)

- Architectural decisions
- Demo flow / video script
- Pitch deck framing
- Submission polish
- Any blocker that requires strategic thinking, not just code

Build in Claude Code. Strategise in chat. Ship by June 7.
