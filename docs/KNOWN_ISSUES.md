# Known issues

This document is the honest catalog of Drip's limitations as of the current commit. Reviewers, judges, and future Claude Code sessions should read this before drawing conclusions about production-readiness. Each entry lists the problem, where it lives, the impact, and what would resolve it.

The order is rough severity — most consequential first. Nothing in this list is a blocker for the hackathon demo.

---

## Contract architecture

### 1. `subscriptionToStream` stale-entry accumulation in `Drip.sol`

**Where**: `Drip._onEvent` — `contracts/contracts/Drip.sol`

The Schedule event the reactivity precompile emits carries the firing timestamp in `eventTopics[1]`, not the subscription ID. So `_onEvent` looks up the firing stream via `scheduleTimestampToStream[ms]` and clears that entry. It does **not** clear the corresponding `subscriptionToStream[subId]` entry because the subscription ID is unavailable in the firing context.

**Impact**: a slow growth of dead entries in `subscriptionToStream`. After N policy checks across the contract's lifetime, the mapping holds N entries even though only the currently-active subscription per stream is meaningful. Each entry is 32 + 32 bytes. Cost grows linearly with check count, no functional consequence — `subscriptionToStream` is only read by `unsubscribeStreamCheck` and off-chain tooling, both of which tolerate staleness.

**Mitigation**: none in the contract. The mapping is `public` so off-chain auditors can detect and ignore stale entries by cross-referencing the current `policy.activeSubscriptionId`.

**Future fix path**: add a `sweepStaleSubscriptions(uint256[] subIds)` helper callable by the policy contract that explicitly deletes entries known-stale. Or, restructure to store the subscription ID inside `eventTopics[2]/[3]` of the Schedule filter (those slots are currently unused) — but that would require coordinating with Somnia on filter semantics for Schedule events.

### 2. No `withdrawFunds` path on `DripPolicies`

**Where**: `DripPolicies.sol` — `registerPolicy` is payable and accepts top-ups via `receive`, but there is no exit.

**Impact**: once a stream sender funds `DripPolicies` to cover future agent invocations, they cannot pull unspent balance back. If a stream is cancelled or disabled with leftover budget, that STT stays in `DripPolicies` forever.

**Mitigation**: register policies with conservative funding (a few cycles' worth), not lump sums. Agent rebates partially offset this.

**Future fix path**: add `function withdrawFunds(uint256 amount) external` gated to a multisig or per-stream sender (the latter requires per-sender accounting we don't currently maintain).

### 3. Cross-contract re-entrancy posture

**Where**: `DripPolicies._onClassified` → `_applyAction` (calls `Drip.pause` / `Drip.resume`) → `_scheduleNext` (calls `Drip.scheduleStreamCheck`).

Both contracts trust each other implicitly. There are no `nonReentrant` guards because Drip's pause/resume/scheduleStreamCheck functions don't currently call back into `DripPolicies`.

**Impact**: if a future change to `Drip.sol` adds a callback to the policy contract from inside `pause`/`resume`, re-entry could observe inconsistent `ActiveCheck` state. Not exploitable in the current code.

**Mitigation**: any change to Drip's `pause`/`resume`/`scheduleStreamCheck` paths should review the CEI ordering in `DripPolicies._onClassified` before landing.

**Future fix path**: add OpenZeppelin's `ReentrancyGuard` to `DripPolicies.handleResponse` if the trust boundary between the contracts ever weakens.

### 4. Collision-bump loop in `Drip.scheduleStreamCheck` has unbounded worst-case gas

**Where**: `Drip.scheduleStreamCheck` — `while (scheduleTimestampToStream[scheduledMs] != 0) { scheduledMs += 1; }`

**Impact**: in the pathological case where thousands of streams attempt to schedule at the exact same `block.timestamp` (which is possible during high-volume registration), the loop bumps `scheduledMs` by 1ms each iteration until it finds an unused slot. Each iteration costs a storage read.

**Mitigation**: at Somnia's expected scale (hundreds of streams, not thousands), this is invisible. Streams register across many seconds of wall-clock time, so timestamp collisions are rare.

**Future fix path**: if scale demands, key the mapping on `(scheduledMs, streamId)` instead of just `scheduledMs`, which removes collisions entirely. Doing so requires adapting `_onEvent` to decode both the timestamp and stream ID — which means encoding the streamId into the Schedule filter's topic[2]/[3] (see issue #1).

### 5. Integer-division dust on per-second stream rate

**Where**: `Drip.createStream` — `ratePerSecond = msg.value / durationSeconds`.

**Impact**: when `msg.value` doesn't divide cleanly by `durationSeconds`, the dust = `msg.value - ratePerSecond × durationSeconds` is unrecoverable for the recipient (their accrual caps at `ratePerSecond × duration`). On `cancel`, the dust goes to the sender. On natural completion (no cancel), the dust stays in `Drip` forever.

**Impact magnitude**: bounded above by `durationSeconds - 1` wei per stream. For a 30-day stream (~2.6M seconds), worst case is ~2.6M wei = 2.6 micro-STT. Negligible.

**Mitigation**: the dust is included in `Drip`'s solvency math (`totalCommittedUnreleased`) so it doesn't break invariants. Sender can always cancel to recover it.

**Future fix path**: add `sweepDust(uint256 streamId)` callable post-completion that pays the dust to either the sender or the recipient. Not worth the contract size for the hackathon.

---

## Agent integration

### 6. Empty-selector `fetchString` returns Go-map repr — RESOLVED via the `json`-wrapper pattern

**Status**: **RESOLVED in Milestone 4 Step B.**

The probe at request [`1964766`](https://agents.testnet.somnia.network/receipts/1964766) showed that `fetchString(url, "")` returns Go's default `map[k:v]` stringification with scientific notation on large numbers — not the raw JSON body. The aggregator now wraps the activity payload in a top-level `json` field whose value is a byte-identical stringified copy of the canonical payload; `DripPolicies` calls `fetchString(url, "json")` which returns that string cleanly.

Documented in `skills/skill-agents.md` "The fetchString empty-selector trap" so future contributors don't rediscover the issue.

### 7. `getRequest` reverts on finalised requests

**Where**: `platform.getRequest(requestId)` — the live Somnia testnet platform reverts with custom error `0x4ec726c7` on requests that have already finalised (Success / Failed / TimedOut). This contradicts the interface definition in `IAgentRequester.sol` which suggests the call is a simple view.

**Impact**: tooling that wants to read post-finalisation request details can't use this method. The receipts API (`https://receipts.testnet.agents.somnia.host/agent-receipts`) is the substitute and is now documented in `skills/skill-agents.md`.

**Mitigation**: documented in skill; tests don't depend on `getRequest` post-finalisation; `MockAgentPlatform` (used in DripPolicies tests) does honour `getRequest` for finalised entries, so test-side use is fine.

**Future fix path**: none from our side — this is a platform behaviour. Worth flagging to Somnia DevRel that the `IAgentRequester.getRequest` interface annotation is misleading.

### 8. LLM Parse Website agent is broken testnet-wide

**Where**: agent ID `12875401142070969085`, manifest `d558921e2082eabf31dc4456288e84578d255a35`.

**Status**: service-side HTTP 400 from all validators, reproducible. Documented in `skills/skill-agents.md` "The base agents" table. Not used by Drip; flagged for any future contributor who tries it.

### 9. No on-chain `unsubscribe` failure path

**Where**: `Drip.unsubscribeStreamCheck` — when called for a subscription ID that has already been auto-removed (one-shot subscriptions remove themselves after firing), the precompile reverts. Our wrapper catches via `if (streamId == 0) return;` based on the mapping, but if the mapping is stale (issue #1), a real `unsubscribe` call could be issued for a non-existent subscription.

**Impact**: in the pathological cleanup case, `DripPolicies.disablePolicy` might revert at the `Drip.unsubscribeStreamCheck` call. `disablePolicy` wraps that call in `try/catch` so it always succeeds from the caller's perspective.

**Mitigation**: the try/catch in `disablePolicy` is the workaround.

---

## Infrastructure & tooling

### 10. Hardhat EDR reserves precompile-range addresses

**Where**: Hardhat's new Rust VM (EDR, default since Hardhat 2.22) silently rejects `hardhat_setCode` against addresses ≤ `0x0100`. The Somnia reactivity precompile lives at `0x0100`, so we cannot mock it at the address level for tests.

**Impact**: `DripPolicies.test.ts` cannot exercise the real `SomniaExtensions` path. We work around this with `TestableDrip` — a subclass that overrides `Drip._subscribeSchedule` and `_unsubscribe` virtual hooks to bypass `SomniaExtensions` entirely. Production `Drip` is unchanged.

**Mitigation**: documented in `Drip.sol` near the virtual hooks. End-to-end testnet runs (Milestone 4 Step D and beyond) are the only validation of the real precompile path.

**Future fix path**: if Hardhat ever stops reserving `0x0100`, switch back to `setCode` + `MockReactivityPrecompile.sol` (already implemented but unused). Or upstream a fix to EDR.

### 11. Wallet private key in `contracts/.env`

**Where**: `contracts/.env` (gitignored).

The deployer/operator private key is stored in plaintext, single-key. Anyone with read access to the project root can read the key. This is fine for hackathon testnet usage but is not a production-grade key management posture.

**Future fix path**: for mainnet deploy, use a hardware-wallet-signed deployment (Frame, Ledger via `wagmi`-style tooling) or AWS KMS / GCP Cloud KMS as the signing backend. Vault-style secret management for any deployed services that hold keys.

### 12. Single deployer wallet is also the source of all test STT

**Where**: same wallet (`0x0bA5…1412`) deploys contracts, funds them, and runs the determinism suites.

Operationally fine but means a key compromise has full blast radius. Production deploys should split: a deploy-only wallet (one-time use), a treasury wallet (funds contracts), and an operations wallet (runs migrations).

---

## Demo / verification gaps

### 13. The aggregator is fictional until Milestone 4 Step A deploys it

**Where**: `DripPolicies.Policy.dataUrl` accepts arbitrary URLs. Tests use `https://example.invalid/…` placeholders.

The aggregator that returns the canonical `{username, repo, windowDays, commitCount, prCount, lastCommitTimestamp}` JSON does not yet exist. Milestone 4 Step A builds it as a Next.js API route and deploys to Vercel. Until then, no real GitHub data can be consumed by `DripPolicies` on testnet.

### 14. End-to-end testnet run — RESOLVED (Milestone 4 Step D)

**Status**: full chain ran successfully on Somnia testnet on 2026-05-26. A self-stream with a fake-username policy was paused autonomously by the AI agent within 70 seconds of registration. Three validators reached unanimous consensus on `"dormant"` with identical token counts. See [`docs/TESTNET_RUN.md`](./TESTNET_RUN.md) for the full transaction-by-transaction audit trail (every tx hash, request ID, and receipt URL is independently verifiable).

### 15. Reactivity Schedule's `topic[1]` is the firing time, not the requested time — RESOLVED

**Where**: empirically discovered in Milestone 4 Step D first attempt (`Drip` at `0x71f1…95dc` — now obsolete).

When a `Schedule` subscription fires, the precompile delivers `eventTopics[1]` as the **actual firing time** with sub-second precision, NOT the `timestampMillis` we passed to `scheduleSubscriptionAtTimestamp`. We observed a 41-ms offset between the requested time (`1779755353000`) and the firing time (`1779755353041`). The filter still matches because Schedule subscriptions treat `topic[1]` as a **lower bound** (per `skill-reactivity.md`: "fires in the first block whose timestamp ≥ topic[1]"), not as an exact-match filter component.

`Drip._onEvent`'s original exact-match lookup `scheduleTimestampToStream[topic[1]]` always failed for this reason.

**Fix** (in `Drip.sol`):
- `scheduleStreamCheck` bumps the collision counter by 1000 ms (one full second), not 1 ms, so every stored `scheduledMs` ends in `000`.
- `_onEvent` rounds the firing time down to the nearest whole second: `scheduledMs = (uint256(topic[1]) / 1000) * 1000`. Falls back to `scheduledMs - 1000` in case the precompile slipped into the next second.

The skill file `skill-reactivity.md` has been updated to document this empirically (Schedule's `topic[1]` semantics gotcha). The first deployment's STT (35 STT in `Drip 0x71f1…95dc`) is unrecoverable — a sunk cost of the discovery.

---

## What this document is not

This is not a security audit. No formal verification has been performed. The contracts are hackathon-grade — they prioritise getting the agent-control loop working end-to-end over hardening against every adversarial scenario. Issues #1–#5 in particular would warrant deeper review before any mainnet deployment.
