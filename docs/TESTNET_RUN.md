# Testnet end-to-end run

This document is the empirical receipt for Drip's full autonomous loop running on Somnia testnet. Each phase below cites real transaction hashes, request IDs, and receipt URLs that any auditor (or judge) can independently verify.

The scenario is deliberately a **dormant** case so the run produces a visible state change: the AI agent classifies a fake GitHub contributor as inactive and the stream pauses itself. Total wall-clock time from policy registration to stream-pause action: **70 seconds**.

## Summary

| | |
|---|---|
| Network | Somnia testnet (chain ID `50312`) |
| Date | 2026-05-26 |
| Drip contract | [`0x4a70d4fca6e96690c7b397ff9ec11bfacc2de253`](https://shannon-explorer.somnia.network/address/0x4a70d4fca6e96690c7b397ff9ec11bfacc2de253) |
| DripPolicies contract | [`0xa7d5f7a0e39177feff7239da91413284ded9d931`](https://shannon-explorer.somnia.network/address/0xa7d5f7a0e39177feff7239da91413284ded9d931) |
| Aggregator (Vercel) | `https://drip-frontend-psi.vercel.app/api/github-activity` |
| Stream ID | 1 |
| Stream amount | 1 STT |
| Stream duration | 3600 s (1 hour) |
| Policy check interval | 60 s |
| Expected verdict | `dormant` |
| Expected action | `pause` |
| **Result** | ✅ stream paused autonomously |

## The autonomous loop, transaction by transaction

### Phase 1 — `createStream`

A self-stream from the deployer wallet to itself. (Self-recipient is irrelevant for the agent loop — the recipient address has no influence on the policy chain.)

| | |
|---|---|
| Tx hash | [`0xc984…07bd`](https://shannon-explorer.somnia.network/tx/0xc9847792edb2d181b4b4588d2074c524bb7c91b5d0690c33207cfe9d0c9007bd) (block 392269059) |
| Stream status after | Active |

### Phase 2 — `registerPolicy` + DripPolicies funding

`registerPolicy` is `payable`. The 3 STT `value` tops up DripPolicies's balance so it can pay for the two agent invocations per policy check (≈ 0.36 STT per cycle).

| | |
|---|---|
| Tx hash | [`0xcc53…d9f8`](https://shannon-explorer.somnia.network/tx/0xcc5379978045c138592291163f32a1c6b4b384e948391befe1b8f08517d6d9f8) (block 392269076) |
| `dataUrl` | `https://drip-frontend-psi.vercel.app/api/github-activity?username=drip-dormant-test-xyz&repo=vercel/next.js&windowDays=7` |
| `dataSelector` | `"json"` (the wrapper field, per M4 Step B validation) |
| `checkIntervalSeconds` | 60 |
| Reactivity subscription ID returned | `2202345` |
| Scheduled for | `1779763630000` ms (`block.timestamp + 60` in whole seconds) |

The `registerPolicy` call internally scheduled the first reactivity subscription via `Drip.scheduleStreamCheck` → `SomniaExtensions.scheduleSubscriptionAtTimestamp`. DripPolicies's balance after: 3 STT.

### Phase 3 — Schedule subscription fires (autonomous, no human)

After 60 seconds, the reactivity precompile fires the Schedule subscription. Drip's `_onEvent` decodes the firing timestamp, looks up the stream, and delegates to `DripPolicies.startPolicyCheck` — which itself calls the JSON API Request agent.

| | |
|---|---|
| Reactive tx hash | [`0xe80e…dd9e`](https://shannon-explorer.somnia.network/tx/0xe80ee2a1263152daed50e9559d8f21f14bbe2592ca7ea9467636b1b4906add9e) (block 392269667) |
| Elapsed from Phase 2 | ≈ 59.1 s (591 blocks at ~100 ms each) |
| JSON API request ID | `2094056` |
| JSON API receipt UI | https://agents.testnet.somnia.network/receipts/2094056 |

This is the demo's "magic moment": the chain itself dispatched the check without anyone sending a transaction.

### Phase 4 — JSON API Request agent fetches the aggregator

The agent's validator subcommittee independently fetches the configured `dataUrl` from a Vercel function, extracts the `json` field, and returns it via `fetchString`.

| | |
|---|---|
| Drip-side tx hash | [`0xef09…ca3f`](https://shannon-explorer.somnia.network/tx/0xef0946c4a306fcffa07b2637f395a3b2794db5079890a009195f2de15968ca3f) (block 392269695) |
| Activity JSON returned | `{"username":"drip-dormant-test-xyz","repo":"vercel/next.js","windowDays":7,"commitCount":0,"prCount":0,"lastCommitTimestamp":0}` |
| Validator agreement | 2/2 captured Success, **unanimous on result bytes** (3rd validator's receipt was still propagating to the receipts service at fetch time; the on-chain Success status confirms 2-of-3 consensus was met) |
| Per-validator HTTP elapsed | 2085 ms / 2294 ms |
| Per-validator bytes (in/out) | 995/5339, 957/4132 |

### Phase 5 — LLM Inference classifies the activity

`DripPolicies._onGithubFetched` immediately fires a second agent request to LLM Inference, passing the canonical Drip classifier prompt (system + prompt split, `chainOfThought=false`, `allowedValues=["active","dormant","inconclusive"]`).

| | |
|---|---|
| Drip-side tx hash | [`0xca4e…3fa8`](https://shannon-explorer.somnia.network/tx/0xca4e1929aba17314a8ef39205dee1bedfe0e52139757241daceb6e8b72163fa8) (block 392269704) |
| LLM Inference request ID | `2094063` |
| LLM receipt UI | https://agents.testnet.somnia.network/receipts/2094063 |
| Decoded verdict | `"dormant"` |
| Validator agreement | **3/3 Success, unanimous** |
| Per-validator prompt / completion tokens | 267 / 8 (identical across all three) |
| Per-validator elapsed | 224 ms / 222 ms / 296 ms |

The token-count uniformity matches the M3 Step 1 determinism suite (also 267/8 for the no-activity case). Drip's classifier is, as advertised, byte-deterministic across validators.

### Phase 6 — action dispatched and stream paused

`DripPolicies._onClassified` dispatches `_applyAction("dormant", streamId=1)`. Stream 1 is Active, so the dispatcher calls `Drip.pause(1, "dormant: no activity in window")`.

| | |
|---|---|
| `PolicyActionTaken` event | `verdict="dormant"`, `action="pause"` (same tx as the LLM callback: `0xca4e…3fa8`) |
| **Stream 1 status after** | **Paused** ✅ |

`_scheduleNext` then queued the subsequent check, so the autonomous chain self-perpetuates without any further human input until the policy is disabled or DripPolicies runs out of funds.

## What this proves

1. **The full agentic loop works on real Somnia testnet, end to end.** Every layer composes: streaming primitive, reactivity-based scheduling, JSON API agent, LLM Inference agent, action dispatch.
2. **Determinism holds in production conditions, not just in the controlled M3 suite.** 3/3 validators returned the same verdict with identical token counts.
3. **The chain is genuinely autonomous.** Between Phase 2 (human registration) and Phase 6 (stream paused), no transaction was sent by any EOA. Every step was either a reactive tx (the precompile firing a subscription, paid for by Drip's balance) or an agent callback (the platform invoking our handler).
4. **The "agent decides, money moves" claim is true.** A specific AI verdict on real GitHub data caused a real payment stream to pause itself. Auditable end to end via the four transactions and two receipt URLs above.

## What didn't work the first time

A first deployment ([Drip `0x71f1…95dc`](https://shannon-explorer.somnia.network/address/0x71f19fd38f9d400c11f19d66980353e5c55195dc), DripPolicies `0xe403…9a5c`) failed in Phase 3 because of an undocumented Somnia reactivity precompile behaviour:

- We registered a subscription requesting `scheduledMs = 1779755353000` (a whole-second multiple).
- The precompile fired it correctly but delivered `eventTopics[1] = 1779755353041` to `_onEvent` — the **actual firing time** with sub-second precision, **not** the requested time.
- `_onEvent`'s exact lookup `scheduleTimestampToStream[topic[1]]` missed (off by 41 ms), reverting with `UnknownSubscriptionTimestamp(1779755353041)`. Failing tx: [`0x0371…d8ee`](https://shannon-explorer.somnia.network/tx/0x0371189f796ba3efe3c6a201fdd333a17f72e45fb63318cce49184726ab1d8ee).

This contradicts a literal reading of `skill-reactivity.md` ("topic[1] == timestamp in ms (the scheduled time)"). It became visible only on testnet because Hardhat's EDR reserves the precompile address `0x0100`, so local tests bypass `SomniaExtensions` via the `TestableDrip` subclass (see `KNOWN_ISSUES.md` #10). The filter does still match — the precompile's Schedule semantics are: `topic[1]` is treated as a lower bound in the FILTER, and the firing event reports the actual time.

**The fix** ([commit](https://github.com/oderahub/drip/blob/main/contracts/contracts/Drip.sol)):
1. `scheduleStreamCheck` bumps the collision counter by **1000** (one second), not 1 ms — guaranteeing every registered `scheduledMs` is a whole-second multiple.
2. `_onEvent` derives the lookup key as `(topic[1] / 1000) * 1000`, with a fallback to `lookupKey - 1000` to handle the rare case of the precompile slipping into the next second.

The skill file (`skill-reactivity.md`) has been updated to document this empirically. Re-deployed contracts (the addresses at the top of this document) pass the full E2E test on the first run.

## Subsequent activity on stream 1 (post-cycle exploratory testing)

The original 70-second autonomous cycle documented above remains the verified-determinism evidence for this milestone. Between May 26 and May 29, 2026, stream 1's policy continued to self-perpetuate at its 60-second interval — by design, because that's exactly the agentic-loop behaviour Drip exists to demonstrate. The cycles were left running while frontend Milestone 5 was developed against live testnet state.

**Stream 1's policy was disabled on May 29, 2026** ([tx `0xf156…d2952a`](https://shannon-explorer.somnia.network/tx/0xf156eaf0bd5dfafd53dff2ff931f4b441c76382eebea720d2ddf49e9f523952a)) so the demo run for Milestone 6 starts on a clean ledger:
- Stream itself remains in `Paused` status (it had been paused by the first cycle and never resumed; recipient never withdrew).
- 11 additional `PolicyCheckScheduled → PolicyCheckStarted → GithubDataFetched → ClassificationReceived → PolicyActionTaken` cycles ran across those 3 days, eight of which reached `"dormant"` classifications and three of which aborted at the JSON-API leg (the aggregator's GitHub fetch occasionally times out under cold-start conditions; the chain auto-schedules the next check on abort, which is the resilience behaviour the spec calls for).
- The Milestone 6 demo run will use a **fresh stream created during the recording**, not stream 1. Stream 1 stays on chain as the canonical M4 evidence; its full event history is browsable at [`/streams/1`](https://drip-frontend-psi.vercel.app/streams/1) and renders all 79 events via the resilient feed implemented in M5 Phase 5.

DripPolicies was topped up to 5 STT on the same day (after the policy disable, balance was 0.04 STT) so M6's demo cycles have ample headroom — [tx `0xe656…41f727381`](https://shannon-explorer.somnia.network/tx/0xe6565713db89b04eeb00514a14c44bb04436ce03d1f5927349969f341f727381). At 0.36 STT per cycle that's ~13 cycles of buffer.

## Repository pointers

- Raw run summary JSON: [`contracts/test-results/testnet-e2e-2026-05-26T02-47-16-960Z.json`](../contracts/test-results/testnet-e2e-2026-05-26T02-47-16-960Z.json)
- Aggregator source: [`frontend/app/api/github-activity/route.ts`](../frontend/app/api/github-activity/route.ts)
- E2E script: [`contracts/scripts/testnet-e2e.ts`](../contracts/scripts/testnet-e2e.ts)
- M3 Step 1 classifier determinism report: [`contracts/test-results/classifier-determinism-2026-05-21T15-07-56-722Z.md`](../contracts/test-results/classifier-determinism-2026-05-21T15-07-56-722Z.md)
- Limitations and gotchas catalog: [`docs/KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)
